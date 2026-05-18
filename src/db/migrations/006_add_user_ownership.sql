DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'conversations'
      AND column_name = 'user_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE conversations
    ALTER COLUMN user_id DROP DEFAULT;

    ALTER TABLE conversations
    ALTER COLUMN user_id TYPE BIGINT
    USING CASE
      WHEN user_id ~ '^[0-9]+$' THEN user_id::BIGINT
      ELSE NULL
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_user_id_fkey'
  ) THEN
    ALTER TABLE conversations
    ADD CONSTRAINT conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
ON conversations(user_id);

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_user_id
ON reservations(user_id);

DROP FUNCTION IF EXISTS save_message(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_last_messages(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_conversation_messages(TEXT, INTEGER);
DROP FUNCTION IF EXISTS ensure_conversation(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS create_tour_reservation(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION ensure_conversation(
  p_conversation_id TEXT,
  p_user_id BIGINT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id INTEGER,
  conversation_id TEXT,
  user_id BIGINT,
  title TEXT,
  last_message_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  INSERT INTO conversations AS c (conversation_id, user_id, title, metadata)
  VALUES (p_conversation_id, p_user_id, p_title, p_metadata)
  ON CONFLICT ON CONSTRAINT conversations_conversation_id_key DO UPDATE
  SET
    user_id = COALESCE(c.user_id, EXCLUDED.user_id),
    title = COALESCE(EXCLUDED.title, c.title),
    metadata = c.metadata || EXCLUDED.metadata
  RETURNING
    c.id,
    c.conversation_id,
    c.user_id,
    c.title,
    c.last_message_at,
    c.metadata,
    c.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION save_message(
  p_conversation_id TEXT,
  p_user_input TEXT,
  p_ai_output TEXT,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  conversation_id TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  existing_user_id BIGINT;
BEGIN
  SELECT c.user_id
  INTO existing_user_id
  FROM conversations AS c
  WHERE c.conversation_id = p_conversation_id;

  IF existing_user_id IS NOT NULL AND p_user_id IS NOT NULL AND existing_user_id <> p_user_id THEN
    RAISE EXCEPTION 'conversation % is not owned by user %', p_conversation_id, p_user_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM ensure_conversation(p_conversation_id, p_user_id);

  RETURN QUERY
  WITH inserted_message AS (
    INSERT INTO messages AS m (conversation_id, user_input, ai_output)
    VALUES (p_conversation_id, p_user_input, p_ai_output)
    RETURNING
      m.id,
      m.conversation_id,
      m.user_input,
      m.ai_output,
      m.created_at
  ), touched_conversation AS (
    UPDATE conversations AS c
    SET last_message_at = CURRENT_TIMESTAMP
    WHERE c.conversation_id = p_conversation_id
  )
  SELECT
    im.id,
    im.conversation_id,
    im.user_input,
    im.ai_output,
    im.created_at
  FROM inserted_message AS im;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'save_chat_message failed for conversation_id %: %',
      p_conversation_id,
      SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION get_last_messages(
  p_conversation_id TEXT,
  p_limit INTEGER DEFAULT 10,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  conversation_id TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE sql
AS $$
  SELECT recent.conversation_id, recent.user_input, recent.ai_output, recent.created_at
  FROM (
    SELECT m.conversation_id, m.user_input, m.ai_output, m.created_at
    FROM messages AS m
    INNER JOIN conversations AS c ON c.conversation_id = m.conversation_id
    WHERE m.conversation_id = p_conversation_id
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) AS recent
  ORDER BY recent.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id TEXT,
  p_limit INTEGER DEFAULT 100,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  conversation_id TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE sql
AS $$
  SELECT m.id, m.conversation_id, m.user_input, m.ai_output, m.created_at
  FROM messages AS m
  INNER JOIN conversations AS c ON c.conversation_id = m.conversation_id
  WHERE m.conversation_id = p_conversation_id
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
  ORDER BY m.created_at ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION create_tour_reservation(
  p_tour_id INTEGER,
  p_participants INTEGER,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_conversation_id TEXT,
  p_confirmation_code TEXT,
  p_discount_rate NUMERIC DEFAULT 0,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  code TEXT,
  message TEXT,
  id INTEGER,
  user_id BIGINT,
  customer_name TEXT,
  customer_email TEXT,
  conversation_id TEXT,
  tour_id INTEGER,
  participants INTEGER,
  confirmation_code TEXT,
  created_at TIMESTAMP,
  total_price NUMERIC,
  tour_name TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  selected_tour tours%ROWTYPE;
  inserted_reservation reservations%ROWTYPE;
  existing_conversation_user_id BIGINT;
  remaining_slots INTEGER;
  subtotal NUMERIC;
  discount_amount NUMERIC;
  calculated_total_price NUMERIC;
BEGIN
  BEGIN
    IF p_conversation_id IS NOT NULL THEN
      SELECT c.user_id
      INTO existing_conversation_user_id
      FROM conversations AS c
      WHERE c.conversation_id = p_conversation_id;

      IF existing_conversation_user_id IS NOT NULL AND p_user_id IS NOT NULL AND existing_conversation_user_id <> p_user_id THEN
        RAISE EXCEPTION 'conversation % is not owned by user %', p_conversation_id, p_user_id
          USING ERRCODE = '42501';
      END IF;

      PERFORM ensure_conversation(p_conversation_id, p_user_id);
    END IF;

    SELECT *
    INTO selected_tour
    FROM tours AS t
    WHERE t.id = p_tour_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT
        false,
        'TOUR_NOT_FOUND'::TEXT,
        format('Tour %s was not found.', p_tour_id)::TEXT,
        NULL::INTEGER,
        NULL::BIGINT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::INTEGER,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::TIMESTAMP,
        NULL::NUMERIC,
        NULL::TEXT,
        NULL::NUMERIC,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::INTEGER,
        NULL::TEXT;
      RETURN;
    END IF;

    IF selected_tour.available_slots < p_participants THEN
      RETURN QUERY
      SELECT
        false,
        'INSUFFICIENT_AVAILABILITY'::TEXT,
        format(
          '%s has %s available slots, but %s were requested.',
          selected_tour.name,
          selected_tour.available_slots,
          p_participants
        )::TEXT,
        NULL::INTEGER,
        NULL::BIGINT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        selected_tour.id,
        p_participants,
        NULL::TEXT,
        NULL::TIMESTAMP,
        NULL::NUMERIC,
        selected_tour.name,
        selected_tour.price,
        selected_tour.available_slots,
        selected_tour.location,
        selected_tour.duration_hours,
        selected_tour.difficulty;
      RETURN;
    END IF;

    subtotal := selected_tour.price * p_participants;
    discount_amount := ROUND(subtotal * COALESCE(p_discount_rate, 0), 2);
    calculated_total_price := ROUND(subtotal - discount_amount, 2);

    UPDATE tours AS t
    SET
      available_slots = t.available_slots - p_participants,
      updated_at = CURRENT_TIMESTAMP
    WHERE t.id = p_tour_id
    RETURNING t.available_slots INTO remaining_slots;

    INSERT INTO reservations (
      user_id,
      customer_name,
      customer_email,
      conversation_id,
      tour_id,
      participants,
      confirmation_code,
      total_price
    )
    VALUES (
      p_user_id,
      p_customer_name,
      p_customer_email,
      p_conversation_id,
      p_tour_id,
      p_participants,
      p_confirmation_code,
      calculated_total_price
    )
    RETURNING * INTO inserted_reservation;

    RETURN QUERY
    SELECT
      true,
      NULL::TEXT,
      NULL::TEXT,
      inserted_reservation.id,
      inserted_reservation.user_id,
      inserted_reservation.customer_name,
      inserted_reservation.customer_email,
      inserted_reservation.conversation_id,
      inserted_reservation.tour_id,
      inserted_reservation.participants,
      inserted_reservation.confirmation_code,
      inserted_reservation.created_at,
      inserted_reservation.total_price,
      selected_tour.name,
      selected_tour.price,
      remaining_slots,
      selected_tour.location,
      selected_tour.duration_hours,
      selected_tour.difficulty;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'create_tour_reservation failed for tour_id %: %',
        p_tour_id,
        SQLERRM
        USING ERRCODE = SQLSTATE;
  END;
END;
$$;
