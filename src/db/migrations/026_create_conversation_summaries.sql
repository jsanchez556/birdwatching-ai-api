CREATE TABLE IF NOT EXISTS conversation_summaries (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version TEXT NOT NULL,
  summary JSONB NOT NULL,
  compacted_message_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  source_token_count INTEGER NOT NULL DEFAULT 0 CHECK (source_token_count >= 0),
  previous_summary_version INTEGER CHECK (previous_summary_version IS NULL OR previous_summary_version > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (conversation_id, version)
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_latest
ON conversation_summaries(conversation_id, version DESC);

CREATE OR REPLACE FUNCTION get_latest_conversation_summary(
  p_conversation_code TEXT,
  p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  conversation_id BIGINT,
  version INTEGER,
  schema_version TEXT,
  summary JSONB,
  compacted_message_ids BIGINT[],
  source_token_count INTEGER,
  previous_summary_version INTEGER,
  created_at TIMESTAMP
)
LANGUAGE sql
AS $$
  SELECT
    cs.id,
    cs.conversation_id,
    cs.version,
    cs.schema_version,
    cs.summary,
    cs.compacted_message_ids,
    cs.source_token_count,
    cs.previous_summary_version,
    cs.created_at
  FROM conversation_summaries AS cs
  INNER JOIN conversations AS c ON c.id = cs.conversation_id
  WHERE c.conversation_code = p_conversation_code
    AND (
      (p_user_id IS NULL AND c.user_id IS NULL)
      OR c.user_id = p_user_id
    )
  ORDER BY cs.version DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_conversation_messages_for_compaction(
  p_conversation_code TEXT,
  p_limit INTEGER DEFAULT 200,
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
  SELECT
    recent.id,
    recent.conversation_id,
    recent.conversation_code,
    recent.user_input,
    recent.ai_output,
    recent.created_at
  FROM (
    SELECT
      m.id,
      m.conversation_id,
      c.conversation_code,
      m.user_input,
      m.ai_output,
      m.created_at
    FROM messages AS m
    INNER JOIN conversations AS c ON c.id = m.conversation_id
    WHERE c.conversation_code = p_conversation_code
      AND (
        (p_user_id IS NULL AND c.user_id IS NULL)
        OR c.user_id = p_user_id
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT GREATEST(p_limit, 1)
  ) AS recent
  ORDER BY recent.created_at ASC, recent.id ASC;
$$;

CREATE OR REPLACE FUNCTION save_conversation_summary(
  p_conversation_code TEXT,
  p_user_id INTEGER,
  p_expected_previous_version INTEGER,
  p_schema_version TEXT,
  p_summary JSONB,
  p_compacted_message_ids BIGINT[],
  p_source_token_count INTEGER
)
RETURNS TABLE (
  id BIGINT,
  conversation_id BIGINT,
  version INTEGER,
  schema_version TEXT,
  summary JSONB,
  compacted_message_ids BIGINT[],
  source_token_count INTEGER,
  previous_summary_version INTEGER,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  conversation_row conversations%ROWTYPE;
  current_version INTEGER;
BEGIN
  SELECT c.*
  INTO conversation_row
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF conversation_row.user_id IS NOT NULL
    AND (p_user_id IS NULL OR conversation_row.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'conversation not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT MAX(cs.version)
  INTO current_version
  FROM conversation_summaries AS cs
  WHERE cs.conversation_id = conversation_row.id;

  IF current_version IS DISTINCT FROM p_expected_previous_version THEN
    RAISE EXCEPTION 'conversation summary version conflict'
      USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  INSERT INTO conversation_summaries AS cs (
    conversation_id,
    version,
    schema_version,
    summary,
    compacted_message_ids,
    source_token_count,
    previous_summary_version
  ) VALUES (
    conversation_row.id,
    COALESCE(current_version, 0) + 1,
    p_schema_version,
    p_summary,
    COALESCE(p_compacted_message_ids, ARRAY[]::BIGINT[]),
    GREATEST(COALESCE(p_source_token_count, 0), 0),
    current_version
  )
  RETURNING
    cs.id,
    cs.conversation_id,
    cs.version,
    cs.schema_version,
    cs.summary,
    cs.compacted_message_ids,
    cs.source_token_count,
    cs.previous_summary_version,
    cs.created_at;
END;
$$;
