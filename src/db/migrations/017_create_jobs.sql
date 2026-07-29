CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'active', 'completed', 'failed', 'not_found')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  result_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_type_status_updated_at
ON jobs(job_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created_at
ON jobs(user_id, created_at DESC);

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

DO $$
BEGIN
  IF to_regclass('public.document_ingestions') IS NOT NULL THEN
    EXECUTE $migration$
      INSERT INTO jobs (
        job_id,
        job_type,
        status,
        user_id,
        request_params,
        result,
        result_meta,
        error_message,
        created_at,
        updated_at,
        completed_at
      )
      SELECT
        job_id,
        'ingestion',
        CASE WHEN status = 'processing' THEN 'queued' ELSE status END,
        user_id,
        jsonb_build_object(
          'sourceType', source_type,
          'sourceMetadata', COALESCE(source_metadata, '{}'::jsonb),
          'sourcePayload', source_payload
        ),
        result,
        '{}'::jsonb,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM document_ingestions
      ON CONFLICT (job_id) DO NOTHING
    $migration$;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_job(
  p_job_id TEXT,
  p_job_type TEXT,
  p_user_id INTEGER,
  p_request_params JSONB
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO jobs (
    job_id,
    job_type,
    status,
    user_id,
    request_params
  )
  VALUES (
    p_job_id,
    p_job_type,
    'queued',
    p_user_id,
    COALESCE(p_request_params, '{}'::jsonb)
  )
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_job(
  p_job_id TEXT,
  p_user_id INTEGER,
  p_job_type TEXT DEFAULT NULL,
  p_allow_public BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
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
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at
  FROM jobs
  WHERE jobs.job_id = p_job_id
    AND (p_job_type IS NULL OR jobs.job_type = p_job_type)
    AND (
      jobs.user_id = p_user_id
      OR (p_allow_public IS TRUE AND jobs.user_id IS NULL)
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_job_for_processing(
  p_job_id TEXT,
  p_job_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
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
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at
  FROM jobs
  WHERE jobs.job_id = p_job_id
    AND (p_job_type IS NULL OR jobs.job_type = p_job_type);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_job_active(
  p_job_id TEXT
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'active',
    updated_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION complete_job(
  p_job_id TEXT,
  p_result JSONB,
  p_result_meta JSONB
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'completed',
    result = COALESCE(p_result, '{}'::jsonb),
    result_meta = COALESCE(p_result_meta, '{}'::jsonb),
    error_message = NULL,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fail_job(
  p_job_id TEXT,
  p_error_message TEXT
)
RETURNS TABLE (
  job_id TEXT,
  job_type TEXT,
  status TEXT,
  user_id INTEGER,
  request_params JSONB,
  result JSONB,
  result_meta JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'failed',
    error_message = p_error_message,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$ LANGUAGE plpgsql;
