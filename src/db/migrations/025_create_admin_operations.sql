CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created_at
ON admin_audit_logs (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_created_at
ON admin_audit_logs (target_type, target_id, created_at DESC);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS suspension_reason_code TEXT;

CREATE TABLE IF NOT EXISTS ai_feature_controls (
  feature TEXT PRIMARY KEY,
  disabled_until TIMESTAMPTZ NOT NULL,
  updated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION create_admin_audit_log(
  p_admin_user_id INTEGER,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_metadata JSONB
)
RETURNS TABLE (
  id BIGINT,
  admin_user_id INTEGER,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE users.id = p_admin_user_id
      AND users.role = 'admin'
      AND users.suspended_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;

  RETURN QUERY
  INSERT INTO admin_audit_logs (
    admin_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  VALUES (
    p_admin_user_id,
    p_action,
    p_target_type,
    p_target_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING
    admin_audit_logs.id,
    admin_audit_logs.admin_user_id,
    admin_audit_logs.action,
    admin_audit_logs.target_type,
    admin_audit_logs.target_id,
    admin_audit_logs.metadata,
    admin_audit_logs.created_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION finalize_admin_audit_log(
  p_audit_id BIGINT,
  p_admin_user_id INTEGER,
  p_metadata JSONB
)
RETURNS TABLE (
  id BIGINT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || COALESCE(p_metadata, '{}'::jsonb)
  WHERE admin_audit_logs.id = p_audit_id
    AND admin_audit_logs.admin_user_id = p_admin_user_id
  RETURNING admin_audit_logs.id, admin_audit_logs.metadata;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION suspend_user_by_admin(
  p_audit_id BIGINT,
  p_admin_user_id INTEGER,
  p_target_user_id INTEGER,
  p_reason_code TEXT
)
RETURNS TABLE (
  user_id INTEGER,
  suspended_at TIMESTAMPTZ,
  reason_code TEXT
) AS $$
DECLARE
  v_target_role TEXT;
  v_suspended_at TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  SELECT users.role INTO v_target_role
  FROM users
  WHERE users.id = p_target_user_id
  FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_USER_NOT_FOUND';
  END IF;

  IF p_target_user_id = p_admin_user_id OR v_target_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_USER_SUSPENSION_FORBIDDEN';
  END IF;

  UPDATE users
  SET
    suspended_at = v_suspended_at,
    suspended_by = p_admin_user_id,
    suspension_reason_code = p_reason_code,
    updated_at = v_suspended_at
  WHERE users.id = p_target_user_id;

  UPDATE refresh_tokens
  SET revoked_at = v_suspended_at
  WHERE refresh_tokens.user_id = p_target_user_id
    AND refresh_tokens.revoked_at IS NULL;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded',
    'reasonCode', p_reason_code
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_target_user_id, v_suspended_at, p_reason_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION disable_ai_feature_by_admin(
  p_audit_id BIGINT,
  p_admin_user_id INTEGER,
  p_feature TEXT,
  p_disabled_until TIMESTAMPTZ
)
RETURNS TABLE (
  feature TEXT,
  disabled_until TIMESTAMPTZ
) AS $$
BEGIN
  IF p_disabled_until <= NOW() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DISABLE_WINDOW';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  INSERT INTO ai_feature_controls (feature, disabled_until, updated_by, updated_at)
  VALUES (p_feature, p_disabled_until, p_admin_user_id, NOW())
  ON CONFLICT ON CONSTRAINT ai_feature_controls_pkey DO UPDATE
  SET
    disabled_until = EXCLUDED.disabled_until,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded',
    'disabledUntil', p_disabled_until
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_feature, p_disabled_until;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enable_ai_feature_by_admin(
  p_audit_id BIGINT,
  p_admin_user_id INTEGER,
  p_feature TEXT
)
RETURNS TABLE (
  feature TEXT
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  DELETE FROM ai_feature_controls AS controls
  WHERE controls.feature = p_feature;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded'
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_feature;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unsuspend_user_by_admin(
  p_audit_id BIGINT,
  p_admin_user_id INTEGER,
  p_target_user_id INTEGER
)
RETURNS TABLE (
  user_id INTEGER,
  suspended_at TIMESTAMPTZ,
  reason_code TEXT
) AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  SELECT users.role INTO v_target_role
  FROM users
  WHERE users.id = p_target_user_id
  FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_USER_NOT_FOUND';
  END IF;

  IF p_target_user_id = p_admin_user_id OR v_target_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_USER_UNSUSPENSION_FORBIDDEN';
  END IF;

  UPDATE users
  SET
    suspended_at = NULL,
    suspended_by = NULL,
    suspension_reason_code = NULL,
    updated_at = NOW()
  WHERE users.id = p_target_user_id;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded'
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_target_user_id, NULL::TIMESTAMPTZ, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;
