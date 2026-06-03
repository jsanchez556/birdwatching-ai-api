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
    INSERT INTO conversations AS c (conversation_code, user_id, metadata, last_message_at)
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
