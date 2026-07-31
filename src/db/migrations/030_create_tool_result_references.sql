CREATE TABLE IF NOT EXISTS tool_result_references (
  reference_id TEXT PRIMARY KEY,
  conversation_code TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  result JSONB NOT NULL,
  total_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (total_count IS NULL OR total_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tool_result_references_conversation
ON tool_result_references(conversation_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_result_references_expiration
ON tool_result_references(expires_at);

CREATE OR REPLACE FUNCTION save_tool_result_reference(
  p_reference_id TEXT,
  p_conversation_code TEXT,
  p_user_id INTEGER,
  p_tool_name TEXT,
  p_result JSONB,
  p_total_count INTEGER,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  reference_id TEXT,
  tool_name TEXT,
  total_count INTEGER,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  WITH expired AS (
    DELETE FROM tool_result_references
    WHERE expires_at <= CURRENT_TIMESTAMP
    RETURNING reference_id
  )
  INSERT INTO tool_result_references AS stored (
    reference_id,
    conversation_code,
    user_id,
    tool_name,
    result,
    total_count,
    expires_at
  )
  VALUES (
    p_reference_id,
    p_conversation_code,
    p_user_id,
    p_tool_name,
    p_result,
    p_total_count,
    p_expires_at
  )
  RETURNING
    stored.reference_id,
    stored.tool_name,
    stored.total_count,
    stored.created_at,
    stored.expires_at;
$$;

CREATE OR REPLACE FUNCTION get_tool_result_reference(
  p_reference_id TEXT,
  p_conversation_code TEXT,
  p_user_id INTEGER
)
RETURNS TABLE (
  reference_id TEXT,
  tool_name TEXT,
  result JSONB,
  total_count INTEGER,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    stored.reference_id,
    stored.tool_name,
    stored.result,
    stored.total_count,
    stored.created_at,
    stored.expires_at
  FROM tool_result_references AS stored
  WHERE stored.reference_id = p_reference_id
    AND stored.conversation_code = p_conversation_code
    AND (
      (stored.user_id IS NULL AND p_user_id IS NULL)
      OR stored.user_id = p_user_id
    )
    AND stored.expires_at > CURRENT_TIMESTAMP;
$$;
