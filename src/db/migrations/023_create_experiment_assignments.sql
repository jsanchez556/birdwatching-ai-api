CREATE TABLE IF NOT EXISTS experiment_assignments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_key),
  CONSTRAINT experiment_assignments_key_not_blank CHECK (BTRIM(experiment_key) <> ''),
  CONSTRAINT experiment_assignments_variant_not_blank CHECK (BTRIM(variant) <> '')
);

CREATE OR REPLACE FUNCTION get_user_experiment_assignment(
  p_user_id INTEGER,
  p_experiment_key TEXT
)
RETURNS TABLE (
  experiment_key TEXT,
  variant TEXT,
  assigned_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    assignment.experiment_key,
    assignment.variant,
    assignment.assigned_at
  FROM experiment_assignments AS assignment
  WHERE assignment.user_id = p_user_id
    AND assignment.experiment_key = p_experiment_key
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION assign_user_experiment_variant(
  p_user_id INTEGER,
  p_experiment_key TEXT,
  p_variant TEXT
)
RETURNS TABLE (
  experiment_key TEXT,
  variant TEXT,
  assigned_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  INSERT INTO experiment_assignments AS assignment (
    user_id,
    experiment_key,
    variant
  )
  VALUES (
    p_user_id,
    BTRIM(p_experiment_key),
    BTRIM(p_variant)
  )
  ON CONFLICT (user_id, experiment_key)
  DO UPDATE SET variant = assignment.variant
  RETURNING
    assignment.experiment_key,
    assignment.variant,
    assignment.assigned_at;
$$;
