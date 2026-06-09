import pool from '../pool.js';
import logger from '../../utils/logger.js';

export class BirdIdentificationQueries {
  async createHistory({ userId, imageUrl, prediction, confidence }) {
    try {
      const query = 'SELECT * FROM save_bird_identification($1, $2, $3, $4)';
      const result = await pool.query(query, [
        userId,
        imageUrl,
        prediction,
        confidence,
      ]);

      logger.info('Bird identification history saved', {
        event: 'bird_identification_history_saved',
        userId,
        identificationId: result.rows[0]?.id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save bird identification history', {
        event: 'bird_identification_history_failed',
        error: error.message,
        userId,
      });
      throw error;
    }
  }
}

export default new BirdIdentificationQueries();
