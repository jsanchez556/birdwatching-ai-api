CREATE TABLE IF NOT EXISTS bird_identifications (
  id SERIAL PRIMARY KEY,
  job_id TEXT UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'active', 'completed', 'failed')),
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


CREATE OR REPLACE FUNCTION create_bird_identification_job(
  p_job_id TEXT,
  p_user_id INTEGER,
  p_image_url TEXT
)
RETURNS TABLE (
  job_id TEXT,
  user_id INTEGER,
  status TEXT,
  image_url TEXT,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO bird_identifications (
    job_id,
    user_id,
    status,
    image_url
  )
  VALUES (
    p_job_id,
    p_user_id,
    'queued',
    p_image_url
  )
  RETURNING
    bird_identifications.job_id,
    bird_identifications.user_id,
    bird_identifications.status,
    bird_identifications.image_url,
    bird_identifications.result,
    bird_identifications.result_meta,
    bird_identifications.error_message,
    bird_identifications.created_at,
    bird_identifications.updated_at,
    bird_identifications.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_bird_identification_job(
  p_job_id TEXT,
  p_user_id INTEGER
)
RETURNS TABLE (
  job_id TEXT,
  user_id INTEGER,
  status TEXT,
  image_url TEXT,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bird_identifications.job_id,
    bird_identifications.user_id,
    bird_identifications.status,
    bird_identifications.image_url,
    bird_identifications.result,
    bird_identifications.result_meta,
    bird_identifications.error_message,
    bird_identifications.created_at,
    bird_identifications.updated_at,
    bird_identifications.completed_at
  FROM bird_identifications
  WHERE bird_identifications.job_id = p_job_id
    AND bird_identifications.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_bird_identification_job_active(
  p_job_id TEXT
)
RETURNS TABLE (
  job_id TEXT,
  user_id INTEGER,
  status TEXT,
  image_url TEXT,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE bird_identifications
  SET
    status = 'active',
    updated_at = NOW()
  WHERE bird_identifications.job_id = p_job_id
  RETURNING
    bird_identifications.job_id,
    bird_identifications.user_id,
    bird_identifications.status,
    bird_identifications.image_url,
    bird_identifications.result,
    bird_identifications.result_meta,
    bird_identifications.error_message,
    bird_identifications.created_at,
    bird_identifications.updated_at,
    bird_identifications.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION complete_bird_identification_job(
  p_job_id TEXT,
  p_result JSONB,
  p_result_meta JSONB
)
RETURNS TABLE (
  job_id TEXT,
  user_id INTEGER,
  status TEXT,
  image_url TEXT,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE bird_identifications
  SET
    status = 'completed',
    result = p_result,
    result_meta = COALESCE(p_result_meta, '{}'::jsonb),
    prediction = COALESCE(
      p_result #>> '{bestMatch,commonName}',
      p_result #>> '{bestMatch,species}',
      p_result #>> '{candidates,0,commonName}',
      p_result #>> '{candidates,0,species}',
      prediction
    ),
    confidence = CASE
      WHEN (p_result #>> '{bestMatch,confidence}') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (p_result #>> '{bestMatch,confidence}')::NUMERIC
      WHEN (p_result #>> '{candidates,0,confidence}') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (p_result #>> '{candidates,0,confidence}')::NUMERIC
      ELSE confidence
    END,
    error_message = NULL,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE bird_identifications.job_id = p_job_id
  RETURNING
    bird_identifications.job_id,
    bird_identifications.user_id,
    bird_identifications.status,
    bird_identifications.image_url,
    bird_identifications.result,
    bird_identifications.result_meta,
    bird_identifications.error_message,
    bird_identifications.created_at,
    bird_identifications.updated_at,
    bird_identifications.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fail_bird_identification_job(
  p_job_id TEXT,
  p_error_message TEXT
)
RETURNS TABLE (
  job_id TEXT,
  user_id INTEGER,
  status TEXT,
  image_url TEXT,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE bird_identifications
  SET
    status = 'failed',
    error_message = p_error_message,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE bird_identifications.job_id = p_job_id
  RETURNING
    bird_identifications.job_id,
    bird_identifications.user_id,
    bird_identifications.status,
    bird_identifications.image_url,
    bird_identifications.result,
    bird_identifications.result_meta,
    bird_identifications.error_message,
    bird_identifications.created_at,
    bird_identifications.updated_at,
    bird_identifications.completed_at;
END;
$$ LANGUAGE plpgsql;
