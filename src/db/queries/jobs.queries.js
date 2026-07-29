import pool from '../pool.js';
import logger from '../../utils/logger.js';

class JobsQueries {
  async createJob({
    jobId,
    jobType,
    userId = null,
    requestParams = {},
  }) {
    const result = await pool.query(
      'SELECT * FROM create_job($1, $2, $3, $4::jsonb)',
      [jobId, jobType, userId, JSON.stringify(requestParams || {})]
    );

    logger.info('Job created', {
      event: 'job_created',
      jobType,
    });

    return result.rows[0] || null;
  }

  async getJob({
    jobId,
    userId = null,
    jobType = null,
    allowPublic = false,
  }) {
    const result = await pool.query(
      'SELECT * FROM get_job($1, $2, $3, $4)',
      [jobId, userId, jobType, allowPublic]
    );

    return result.rows[0] || null;
  }

  async getJobForProcessing({ jobId, jobType = null }) {
    const result = await pool.query(
      'SELECT * FROM get_job_for_processing($1, $2)',
      [jobId, jobType]
    );

    return result.rows[0] || null;
  }

  async markActive({ jobId }) {
    const result = await pool.query(
      'SELECT * FROM mark_job_active($1)',
      [jobId]
    );

    return result.rows[0] || null;
  }

  async completeJob({ jobId, result, meta = {} }) {
    const queryResult = await pool.query(
      'SELECT * FROM complete_job($1, $2::jsonb, $3::jsonb)',
      [jobId, JSON.stringify(result || {}), JSON.stringify(meta || {})]
    );

    logger.info('Job completed', {
      event: 'job_completed',
    });

    return queryResult.rows[0] || null;
  }

  async failJob({ jobId, errorMessage }) {
    const result = await pool.query(
      'SELECT * FROM fail_job($1, $2)',
      [jobId, errorMessage]
    );

    logger.warn('Job failed', {
      event: 'job_failed',
    });

    return result.rows[0] || null;
  }
}

export { JobsQueries };
export default new JobsQueries();
