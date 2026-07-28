import pool from '../pool.js';

class FeatureControlQueries {
  async getActiveDisable({ feature }) {
    const result = await pool.query(`
      SELECT feature, disabled_until
      FROM ai_feature_controls
      WHERE feature = $1
        AND disabled_until > NOW()
      LIMIT 1
    `, [feature]);
    return result.rows[0] || null;
  }

  async getActiveDisables({ features }) {
    const result = await pool.query(`
      SELECT requested.feature, controls.disabled_until
      FROM UNNEST($1::TEXT[]) AS requested(feature)
      LEFT JOIN ai_feature_controls AS controls
        ON controls.feature = requested.feature
       AND controls.disabled_until > NOW()
      ORDER BY requested.feature
    `, [features]);
    return result.rows;
  }
}

export { FeatureControlQueries };
export default new FeatureControlQueries();
