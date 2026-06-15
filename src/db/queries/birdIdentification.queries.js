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

  async createJob({ jobId, userId, imageUrl }) {
    const result = await pool.query(
      'SELECT * FROM create_bird_identification_job($1, $2, $3)',
      [jobId, userId, imageUrl]
    );

    logger.info('Bird identification job created', {
      event: 'bird_identification_job_created',
      jobId,
      userId,
    });

    return result.rows[0] || null;
  }

  async getJob({ jobId, userId }) {
    const result = await pool.query(
      'SELECT * FROM get_bird_identification_job($1, $2)',
      [jobId, userId]
    );

    return result.rows[0] || null;
  }

  async markActive({ jobId }) {
    const result = await pool.query(
      'SELECT * FROM mark_bird_identification_job_active($1)',
      [jobId]
    );

    return result.rows[0] || null;
  }

  async completeJob({ jobId, result, meta = {} }) {
    const queryResult = await pool.query(
      'SELECT * FROM complete_bird_identification_job($1, $2::jsonb, $3::jsonb)',
      [jobId, JSON.stringify(result || {}), JSON.stringify(meta || {})]
    );

    logger.info('Bird identification job completed', {
      event: 'bird_identification_job_completed',
      jobId,
    });

    return queryResult.rows[0] || null;
  }

  async failJob({ jobId, errorMessage }) {
    const result = await pool.query(
      'SELECT * FROM fail_bird_identification_job($1, $2)',
      [jobId, errorMessage]
    );

    logger.warn('Bird identification job failed', {
      event: 'bird_identification_job_failed',
      jobId,
    });

    return result.rows[0] || null;
  }
}

export default new BirdIdentificationQueries();
