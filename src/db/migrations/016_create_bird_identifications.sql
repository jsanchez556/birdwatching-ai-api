CREATE TABLE IF NOT EXISTS bird_identifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prediction TEXT,
  confidence NUMERIC(5, 4),
  result JSONB,
  result_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bird_identifications_user_created_at
ON bird_identifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bird_identifications_user_updated_at
ON bird_identifications(user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION save_bird_identification(
  p_user_id INTEGER,
  p_image_url TEXT,
  p_prediction TEXT,
  p_confidence NUMERIC,
  p_result JSONB,
  p_result_meta JSONB
)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  image_url TEXT,
  prediction TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO bird_identifications (
    user_id,
    image_url,
    prediction,
    confidence,
    result,
    result_meta,
    completed_at
  )
  VALUES (
    p_user_id,
    p_image_url,
    p_prediction,
    p_confidence,
    p_result,
    COALESCE(p_result_meta, '{}'::jsonb),
    NOW()
  )
  RETURNING
    bird_identifications.id,
    bird_identifications.user_id,
    bird_identifications.image_url,
    bird_identifications.prediction,
    bird_identifications.confidence,
    bird_identifications.created_at;
END;
$$ LANGUAGE plpgsql;
