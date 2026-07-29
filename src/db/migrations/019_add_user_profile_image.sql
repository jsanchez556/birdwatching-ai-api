ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_image_key TEXT;

CREATE OR REPLACE FUNCTION update_user_profile(
  p_user_id INTEGER,
  p_name TEXT
)
RETURNS TABLE (
  id INTEGER,
  email TEXT,
  name TEXT,
  role TEXT,
  profile_image_key TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET name = NULLIF(BTRIM(p_name), '')
  WHERE users.id = p_user_id
  RETURNING
    users.id,
    users.email,
    users.name,
    users.role,
    users.profile_image_key,
    users.password_hash,
    users.created_at,
    users.updated_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_profile_image(
  p_user_id INTEGER,
  p_profile_image_key TEXT
)
RETURNS TABLE (
  id INTEGER,
  email TEXT,
  name TEXT,
  role TEXT,
  profile_image_key TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET profile_image_key = NULLIF(BTRIM(p_profile_image_key), '')
  WHERE users.id = p_user_id
  RETURNING
    users.id,
    users.email,
    users.name,
    users.role,
    users.profile_image_key,
    users.password_hash,
    users.created_at,
    users.updated_at;
END;
$$ LANGUAGE plpgsql;
