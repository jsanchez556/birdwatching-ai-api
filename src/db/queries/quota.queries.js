import pool from '../pool.js';

function mapQuotaReservation(row) {
  if (!row) {
    return null;
  }

  return {
    allowed: row.allowed === true,
    usageEventId: row.usage_event_id,
    plan: row.plan_name,
    feature: row.feature,
    used: Number(row.used),
    max: Number(row.max_allowed),
  };
}

class QuotaQueries {
  async reserveDailyUsage({ userId, feature }) {
    const result = await pool.query(
      'SELECT * FROM reserve_daily_usage($1, $2)',
      [userId, feature]
    );

    return mapQuotaReservation(result.rows[0]);
  }
}

export { QuotaQueries, mapQuotaReservation };
export default new QuotaQueries();
