BEGIN;

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS conflict_key TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE user_memories
    ADD CONSTRAINT user_memories_conflict_key_length
    CHECK (conflict_key IS NULL OR (
      LENGTH(BTRIM(conflict_key)) BETWEEN 1 AND 100
      AND conflict_key ~ '^[a-z0-9_]+$'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE user_memories
    ADD CONSTRAINT user_memories_resolution_check
    CHECK (resolution IN ('none', 'explicit_recent_correction'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_memories_active_conflict_key
ON user_memories(user_id, category, conflict_key, created_at DESC)
WHERE is_active = TRUE AND conflict_key IS NOT NULL;

DROP FUNCTION IF EXISTS get_active_user_memories(BIGINT, INTEGER);

CREATE FUNCTION get_active_user_memories(
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF user_memories
LANGUAGE sql
AS $$
  SELECT um.*
  FROM user_memories AS um
  WHERE um.user_id = p_user_id
    AND um.is_active = TRUE
    AND (um.expires_at IS NULL OR um.expires_at > CURRENT_TIMESTAMP)
  ORDER BY um.confidence DESC, um.created_at DESC, um.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION save_user_memory_v2(
  p_user_id BIGINT,
  p_category TEXT,
  p_content TEXT,
  p_content_fingerprint TEXT,
  p_confidence NUMERIC,
  p_source_message_id BIGINT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_is_user_editable BOOLEAN DEFAULT TRUE,
  p_conflict_key TEXT DEFAULT NULL,
  p_resolution TEXT DEFAULT 'none',
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
  normalized_superseded_ids BIGINT[] := COALESCE(p_superseded_memory_ids, ARRAY[]::BIGINT[]);
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

  IF p_resolution NOT IN ('none', 'explicit_recent_correction') THEN
    RAISE EXCEPTION 'invalid memory conflict resolution'
      USING ERRCODE = '22023';
  END IF;

  IF (CARDINALITY(normalized_superseded_ids) > 0)
    IS DISTINCT FROM (p_resolution = 'explicit_recent_correction') THEN
    RAISE EXCEPTION 'supersession requires explicit recent correction'
      USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO superseded_count
  FROM user_memories AS um
  WHERE um.id = ANY(normalized_superseded_ids)
    AND um.user_id = p_user_id
    AND um.category = p_category
    AND um.is_active = TRUE
    AND (
      p_conflict_key IS NULL
      OR um.conflict_key IS NULL
      OR um.conflict_key = p_conflict_key
    );

  IF superseded_count <> CARDINALITY(normalized_superseded_ids) THEN
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
    is_user_editable,
    conflict_key,
    resolution
  ) VALUES (
    p_user_id,
    p_category,
    BTRIM(p_content),
    p_content_fingerprint,
    p_confidence,
    p_source_message_id,
    p_expires_at,
    COALESCE(p_is_user_editable, TRUE),
    NULLIF(BTRIM(p_conflict_key), ''),
    p_resolution
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
    superseded_by_id = inserted_memory.id,
    superseded_at = CURRENT_TIMESTAMP,
    resolution = 'explicit_recent_correction'
  WHERE um.id = ANY(normalized_superseded_ids);

  RETURN NEXT inserted_memory;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_memory_history(
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF user_memories
LANGUAGE sql
AS $$
  SELECT um.*
  FROM user_memories AS um
  WHERE um.user_id = p_user_id
  ORDER BY um.created_at DESC, um.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

COMMIT;
