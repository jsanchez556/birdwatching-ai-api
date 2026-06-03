DROP FUNCTION IF EXISTS get_all_messages(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION get_all_messages(
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 100
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
  JOIN conversations AS c ON c.id = m.conversation_id
  ORDER BY m.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS delete_message_by_id(BIGINT);
CREATE OR REPLACE FUNCTION delete_message_by_id(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM messages AS m
  WHERE m.id = p_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;
