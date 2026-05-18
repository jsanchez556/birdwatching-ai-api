CREATE TABLE IF NOT EXISTS usage_logs (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  estimated_cost NUMERIC(12, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created_at
ON usage_logs(user_id, created_at DESC);
