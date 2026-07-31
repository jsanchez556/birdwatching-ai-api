CREATE TABLE IF NOT EXISTS user_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'preferences',
    'accessibility_requirements',
    'recurring_travel_constraints',
    'bird_interests',
    'preferred_language',
    'budget_ranges'
  )),
  content TEXT NOT NULL CHECK (LENGTH(BTRIM(content)) BETWEEN 1 AND 500),
  content_fingerprint TEXT NOT NULL CHECK (content_fingerprint ~ '^[a-f0-9]{64}$'),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  is_user_editable BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by_id BIGINT REFERENCES user_memories(id) ON DELETE SET NULL,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memories_active_fingerprint
ON user_memories(user_id, category, content_fingerprint)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_memories_active_user
ON user_memories(user_id, created_at DESC)
WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION get_active_user_memories(
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  category TEXT,
  content TEXT,
  confidence NUMERIC,
  source_message_id BIGINT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_user_editable BOOLEAN
)
LANGUAGE sql
AS $$
  SELECT
    um.id,
    um.user_id,
    um.category,
    um.content,
    um.confidence,
    um.source_message_id,
    um.created_at,
    um.expires_at,
    um.is_user_editable
  FROM user_memories AS um
  WHERE um.user_id = p_user_id
    AND um.is_active = TRUE
    AND (um.expires_at IS NULL OR um.expires_at > CURRENT_TIMESTAMP)
  ORDER BY um.confidence DESC, um.created_at DESC, um.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION save_user_memory(
  p_user_id BIGINT,
  p_category TEXT,
  p_content TEXT,
  p_content_fingerprint TEXT,
  p_confidence NUMERIC,
  p_source_message_id BIGINT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_is_user_editable BOOLEAN DEFAULT TRUE,
  p_superseded_memory_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[]
)
RETURNS SETOF user_memories
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  source_owner_id BIGINT;
  superseded_count INTEGER;
  inserted_memory user_memories%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  SELECT c.user_id
  INTO source_owner_id
  FROM messages AS m
  INNER JOIN conversations AS c ON c.id = m.conversation_id
  WHERE m.id = p_source_message_id;

  IF source_owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'memory source message is not owned by user'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO superseded_count
  FROM user_memories AS um
  WHERE um.id = ANY(COALESCE(p_superseded_memory_ids, ARRAY[]::BIGINT[]))
    AND um.user_id = p_user_id
    AND um.category = p_category
    AND um.is_active = TRUE;

  IF superseded_count <> CARDINALITY(COALESCE(p_superseded_memory_ids, ARRAY[]::BIGINT[])) THEN
    RAISE EXCEPTION 'invalid memories selected for supersession'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO user_memories AS um (
    user_id,
    category,
    content,
    content_fingerprint,
    confidence,
    source_message_id,
    expires_at,
    is_user_editable
  ) VALUES (
    p_user_id,
    p_category,
    BTRIM(p_content),
    p_content_fingerprint,
    p_confidence,
    p_source_message_id,
    p_expires_at,
    COALESCE(p_is_user_editable, TRUE)
  )
  ON CONFLICT (user_id, category, content_fingerprint) WHERE is_active = TRUE
  DO NOTHING
  RETURNING um.* INTO inserted_memory;

  IF inserted_memory.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE user_memories AS um
  SET
    is_active = FALSE,
    superseded_by_id = inserted_memory.id
  WHERE um.id = ANY(COALESCE(p_superseded_memory_ids, ARRAY[]::BIGINT[]));

  RETURN NEXT inserted_memory;
END;
$$;
