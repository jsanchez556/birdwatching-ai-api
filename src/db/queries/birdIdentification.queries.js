import pool from '../pool.js';
import logger from '../../utils/logger.js';

export class BirdIdentificationQueries {
  async createHistory({
    userId,
    imageUrl,
    prediction,
    confidence,
    result = null,
    meta = {},
  }) {
    try {
      const query = 'SELECT * FROM save_bird_identification($1, $2, $3, $4, $5::jsonb, $6::jsonb)';
      const queryResult = await pool.query(query, [
        userId,
        imageUrl,
        prediction,
        confidence,
        JSON.stringify(result || null),
        JSON.stringify(meta || {}),
      ]);

      logger.info('Bird identification history saved', {
        event: 'bird_identification_history_saved',
      });

      return queryResult.rows[0];
    } catch (error) {
      logger.error('Failed to save bird identification history', {
        event: 'bird_identification_history_failed',
      });
      throw error;
    }
  }
}

export default new BirdIdentificationQueries();
