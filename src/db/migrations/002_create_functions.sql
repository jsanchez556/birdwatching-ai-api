CREATE OR REPLACE FUNCTION ensure_conversation(
  p_conversation_id TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id INTEGER,
  conversation_id TEXT,
  user_id TEXT,
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
    user_id = COALESCE(EXCLUDED.user_id, c.user_id),
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
  p_ai_output TEXT
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
BEGIN
  PERFORM ensure_conversation(p_conversation_id);

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
  p_limit INTEGER DEFAULT 10
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
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) AS recent
  ORDER BY recent.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION get_all_messages(
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 100
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
  ORDER BY m.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id TEXT,
  p_limit INTEGER DEFAULT 100
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
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION delete_message_by_id(p_id INTEGER)
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