import pool from '../pool.js';

class UserAccessQueries {
  async getAccessState({ userId }) {
    const result = await pool.query(`
      SELECT id, role, suspended_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `, [userId]);
    return result.rows[0] || null;
  }
}

export { UserAccessQueries };
export default new UserAccessQueries();
