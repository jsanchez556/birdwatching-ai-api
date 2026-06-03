CREATE INDEX IF NOT EXISTS idx_conversations_user_last_message
ON conversations(user_id, last_message_at DESC NULLS LAST, created_at DESC);

UPDATE conversations
SET
  conversation_type = COALESCE(metadata->>'conversationType', conversation_type, 'regular'),
  conversation_source = COALESCE(metadata->>'conversationSource', metadata->>'entrySource', conversation_source)
WHERE metadata ? 'conversationType'
  OR metadata ? 'conversationSource'
  OR metadata ? 'entrySource';


  -- Create schedules and schedule_by_tour tables, seed schedules, and
-- associate the 'early' schedule with every tour.

CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS schedule_by_tour (
  tour_id BIGINT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tour_id, schedule_id)
);

-- Seed schedules (only insert if they don't already exist)
INSERT INTO schedules (name, time, is_active)
SELECT v.name, v.time, v.is_active
FROM (VALUES
  ('early', '06:00'::time, TRUE),
  ('afternoon', '15:00'::time, TRUE),
  ('night', '19:00'::time, TRUE)
) AS v(name, time, is_active)
LEFT JOIN schedules s ON s.name = v.name
WHERE s.id IS NULL;

-- Associate the 'early' schedule with every existing tour.
WITH early AS (
  SELECT id FROM schedules WHERE name = 'early' LIMIT 1
)
INSERT INTO schedule_by_tour (tour_id, schedule_id, is_active)
SELECT t.id, e.id, TRUE
FROM tours t, early e
ON CONFLICT (tour_id, schedule_id) DO UPDATE SET is_active = EXCLUDED.is_active;


CREATE TABLE IF NOT EXISTS transportations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  charge_type TEXT NOT NULL,
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE transportations
  ADD CONSTRAINT chk_transportations_lat_range CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  ADD CONSTRAINT chk_transportations_lon_range CHECK (lon IS NULL OR lon BETWEEN -180 AND 180);

ALTER TABLE transportations
    ADD CONSTRAINT transportations_charge_type_check CHECK (charge_type IN ('pp', 'pv'  ));

CREATE TABLE IF NOT EXISTS transportation_by_node (
  node_id BIGINT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  transportation_id INTEGER NOT NULL REFERENCES transportations(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  min_rate NUMERIC(10, 2) NOT NULL CHECK (min_rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (node_id, transportation_id)
);

-- Seed transportations for reservation transport options.
INSERT INTO transportations (title, description, charge_type, lat, lon, is_active)
SELECT v.title, v.description, v.charge_type, v.lat, v.lon, v.is_active
FROM (VALUES
  (
    'Shared birding shuttle',
    'Scheduled transfers from San Jose toward key birding regions with space for daypacks and optics.',
    'pp',
    9.9339::numeric,
    -84.0849::numeric,
    TRUE
  ),
  (
    'Private lodge-to-lodge transfer',
    'Door-to-door transport timed around early checkouts, guide meetups, and longer birding days.',
    'pv',
    NULL,
    NULL,
    TRUE
  ),
  (
    'Tortuguero canal connection',
    'Boat logistics for Tortuguero birding itineraries and wetland departures.',
    'pp',
    10.5456::numeric,
    83.5959::numeric,
    TRUE
  )
) AS v(title, description, charge_type, lat, lon, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM transportations t WHERE t.title = v.title
);

-- Associate the first transportation with every parent node and set price to 100.
WITH first_transport AS (
  SELECT id FROM transportations WHERE title = 'Shared birding shuttle' LIMIT 1
)
INSERT INTO transportation_by_node (node_id, transportation_id, price, is_active)
SELECT n.id, ft.id, 100.00, TRUE
FROM node n
CROSS JOIN first_transport ft
WHERE n.parent_id IS NULL
ON CONFLICT (node_id, transportation_id) DO UPDATE
SET price = EXCLUDED.price,
    is_active = EXCLUDED.is_active;

DROP FUNCTION IF EXISTS save_message(TEXT, TEXT, TEXT, INTEGER, JSONB);

CREATE OR REPLACE FUNCTION save_message(
  p_conversation_code TEXT,
  p_user_input TEXT,
  p_ai_output TEXT,
  p_user_id INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  conversation_id BIGINT,
  conversation_code TEXT,
  user_input TEXT,
  ai_output TEXT,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  existing_user_id INTEGER;
BEGIN
  SELECT c.user_id
  INTO existing_user_id
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code;

  IF existing_user_id IS NOT NULL AND p_user_id IS NOT NULL AND existing_user_id <> p_user_id THEN
    RAISE EXCEPTION 'conversation % is not owned by user %', p_conversation_code, p_user_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH conversation_row AS (
    INSERT INTO conversations AS c (
      conversation_code,
      user_id,
      metadata,
      last_message_at
    )
    VALUES (
      p_conversation_code,
      p_user_id,
      COALESCE(p_metadata, '{}'::jsonb),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT conversations_conversation_code_key DO UPDATE
    SET
      user_id = COALESCE(c.user_id, EXCLUDED.user_id),
      metadata = COALESCE(c.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      last_message_at = CURRENT_TIMESTAMP
    RETURNING c.id, c.conversation_code
  ), inserted_message AS (
    INSERT INTO messages AS m (conversation_id, user_input, ai_output)
    SELECT cr.id, p_user_input, p_ai_output
    FROM conversation_row AS cr
    RETURNING
      m.id,
      m.conversation_id,
      m.user_input,
      m.ai_output,
      m.created_at
  )
  SELECT
    im.id,
    im.conversation_id,
    cr.conversation_code,
    im.user_input,
    im.ai_output,
    im.created_at
  FROM inserted_message AS im
  JOIN conversation_row AS cr ON cr.id = im.conversation_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'save_chat_message failed for conversation_code %: %',
      p_conversation_code,
      SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;