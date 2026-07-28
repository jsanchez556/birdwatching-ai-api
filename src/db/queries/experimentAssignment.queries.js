import pool from '../pool.js';

function mapAssignment(row) {
  if (!row) return null;

  return {
    experiment: row.experiment_key,
    variant: row.variant,
    assignedAt: row.assigned_at,
  };
}

class ExperimentAssignmentQueries {
  async get({ userId, experiment }) {
    const result = await pool.query(
      'SELECT * FROM get_user_experiment_assignment($1, $2)',
      [userId, experiment]
    );

    return mapAssignment(result.rows[0]);
  }

  async assign({ userId, experiment, variant }) {
    const result = await pool.query(
      'SELECT * FROM assign_user_experiment_variant($1, $2, $3)',
      [userId, experiment, variant]
    );

    return mapAssignment(result.rows[0]);
  }
}

export {
  ExperimentAssignmentQueries,
  mapAssignment,
};
export default new ExperimentAssignmentQueries();
