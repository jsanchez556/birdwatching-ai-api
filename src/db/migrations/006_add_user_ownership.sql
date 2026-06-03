ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id INTEGER;

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
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
ON conversations(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_user_id_fkey'
  ) THEN
    ALTER TABLE reservations
    ADD CONSTRAINT reservations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservations_user_id
ON reservations(user_id);

DROP FUNCTION IF EXISTS get_last_messages(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_conversation_messages(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS ensure_conversation(TEXT, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS create_tour_reservation(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION ensure_conversation(
  p_conversation_code TEXT,
  p_user_id INTEGER DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  conversation_code TEXT,
  user_id INTEGER,
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
  INSERT INTO conversations AS c (conversation_code, user_id, title, metadata)
  VALUES (p_conversation_code, p_user_id, p_title, p_metadata)
  ON CONFLICT ON CONSTRAINT conversations_conversation_code_key DO UPDATE
  SET
    user_id = COALESCE(c.user_id, EXCLUDED.user_id),
    title = COALESCE(EXCLUDED.title, c.title),
    metadata = c.metadata || EXCLUDED.metadata
  RETURNING
    c.id,
    c.conversation_code,
    c.user_id,
    c.title,
    c.last_message_at,
    c.metadata,
    c.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION get_last_messages(
  p_conversation_code TEXT,
  p_limit INTEGER DEFAULT 10,
  p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  conversation_id BIGINT,
  conversation_code TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE sql
AS $$
  SELECT recent.conversation_id, recent.conversation_code, recent.user_input, recent.ai_output, recent.created_at
  FROM (
    SELECT m.conversation_id, c.conversation_code, m.user_input, m.ai_output, m.created_at
    FROM messages AS m
    INNER JOIN conversations AS c ON c.id = m.conversation_id
    WHERE c.conversation_code = p_conversation_code
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) AS recent
  ORDER BY recent.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_code TEXT,
  p_limit INTEGER DEFAULT 100,
  p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  conversation_id BIGINT,
  conversation_code TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE sql
AS $$
  SELECT m.id, m.conversation_id, c.conversation_code, m.user_input, m.ai_output, m.created_at
  FROM messages AS m
  INNER JOIN conversations AS c ON c.id = m.conversation_id
  WHERE c.conversation_code = p_conversation_code
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
  ORDER BY m.created_at ASC
  LIMIT p_limit;
$$;
