import pool from '../pool.js';
import logger from '../../utils/logger.js';

export class UsageQueries {
  async createUsageEvent({
    userId,
    feature,
    tokens = 0,
    estimatedCost = null,
    traceId = null,
    modelUsage = [],
  }) {
    const result = await pool.query(
      'SELECT * FROM record_usage_event($1, $2, $3, $4, $5, $6)',
      [userId, feature, tokens, estimatedCost, traceId, JSON.stringify(modelUsage || [])]
    );

    return result.rows[0] || null;
  }

  async updateUsageEventCost({
    usageEventId,
    userId,
    tokens = 0,
    estimatedCost = null,
    traceId = null,
    modelUsage = [],
  }) {
    const result = await pool.query(
      'SELECT * FROM update_usage_event_cost($1, $2, $3, $4, $5, $6)',
      [usageEventId, userId, tokens, estimatedCost, traceId, JSON.stringify(modelUsage || [])]
    );

    return result.rows[0] || null;
  }

  async getMonthlyDashboard({ userId, monthStart = null }) {
    const result = await pool.query(
      'SELECT * FROM get_monthly_usage_dashboard($1, $2)',
      [userId, monthStart]
    );

    return result.rows[0] || null;
  }

  async createLog({ userId, promptTokens, completionTokens, estimatedCost }) {
    try {
      const query = `
        INSERT INTO usage_logs (
          user_id,
          prompt_tokens,
          completion_tokens,
          estimated_cost
        )
        VALUES ($1, $2, $3, $4)
        RETURNING user_id, prompt_tokens, completion_tokens, estimated_cost, created_at
      `;
      const result = await pool.query(query, [
        userId,
        promptTokens,
        completionTokens,
        estimatedCost,
      ]);

      logger.info('OpenAI usage log saved', {
        userId,
        promptTokens,
        completionTokens,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save OpenAI usage log', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }
}

export default new UsageQueries();
