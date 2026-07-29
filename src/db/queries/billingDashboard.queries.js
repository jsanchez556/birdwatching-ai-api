import pool from '../pool.js';

class BillingDashboardQueries {
  async getAdminDashboard({ monthStart = null } = {}) {
    const result = await pool.query(
      'SELECT * FROM get_admin_billing_dashboard($1)',
      [monthStart]
    );

    return result.rows[0] || null;
  }
}

export { BillingDashboardQueries };
export default new BillingDashboardQueries();
