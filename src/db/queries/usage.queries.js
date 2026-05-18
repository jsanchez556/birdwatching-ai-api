import pool from '../pool.js';
import logger from '../../utils/logger.js';

export class UsageQueries {
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
