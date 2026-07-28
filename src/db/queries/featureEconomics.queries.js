import pool from '../pool.js';

class FeatureEconomicsQueries {
  async getEconomics({ granularity, startAt, endAt }) {
    const result = await pool.query(
      'SELECT * FROM get_ai_feature_economics($1, $2, $3)',
      [granularity, startAt, endAt]
    );

    return result.rows;
  }
}

export { FeatureEconomicsQueries };
export default new FeatureEconomicsQueries();
