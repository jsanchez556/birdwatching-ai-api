ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE conversations
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

DROP FUNCTION IF EXISTS save_message(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS save_message(TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS save_message(TEXT, TEXT, TEXT, BIGINT, JSONB);

CREATE OR REPLACE FUNCTION save_message(
  p_conversation_id TEXT,
  p_user_input TEXT,
  p_ai_output TEXT,
  p_user_id BIGINT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
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

  PERFORM ensure_conversation(p_conversation_id, p_user_id, NULL, COALESCE(p_metadata, '{}'::jsonb));

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
    SET
      last_message_at = CURRENT_TIMESTAMP,
      metadata = COALESCE(c.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
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
