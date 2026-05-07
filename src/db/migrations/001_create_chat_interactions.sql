-- Create messages table for storing chat history
-- Run this script in your Railway PostgreSQL database

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_input TEXT NOT NULL,
  ai_output TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT 'default';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_created_at 
ON messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
ON messages(conversation_id, created_at DESC);
