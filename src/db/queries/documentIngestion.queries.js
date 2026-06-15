import pool from '../pool.js';
import logger from '../../utils/logger.js';

class DocumentIngestionQueries {
  async createJob({
    jobId,
    userId,
    status,
    sourceType,
    sourceMetadata = {},
    sourcePayload,
  }) {
    const result = await pool.query(
      'SELECT * FROM create_document_ingestion($1, $2, $3, $4, $5::jsonb, $6::jsonb)',
      [
        jobId,
        userId,
        status,
        sourceType,
        JSON.stringify(sourceMetadata || {}),
        JSON.stringify(sourcePayload || {}),
      ]
    );

    logger.info('Document ingestion job created', {
      event: 'document_ingestion_job_created',
      jobId,
      userId,
      sourceType,
    });

    return result.rows[0] || null;
  }

  async getJob({ jobId, userId }) {
    const result = await pool.query(
      'SELECT * FROM get_document_ingestion($1, $2)',
      [jobId, userId]
    );

    return result.rows[0] || null;
  }

  async getJobForProcessing({ jobId }) {
    const result = await pool.query(
      'SELECT * FROM get_document_ingestion_for_processing($1)',
      [jobId]
    );

    return result.rows[0] || null;
  }

  async markActive({ jobId }) {
    const result = await pool.query(
      'SELECT * FROM mark_document_ingestion_active($1)',
      [jobId]
    );

    return result.rows[0] || null;
  }

  async completeJob({ jobId, result }) {
    const queryResult = await pool.query(
      'SELECT * FROM complete_document_ingestion($1, $2::jsonb)',
      [jobId, JSON.stringify(result || {})]
    );

    logger.info('Document ingestion job completed', {
      event: 'document_ingestion_job_completed',
      jobId,
    });

    return queryResult.rows[0] || null;
  }

  async failJob({ jobId, errorMessage }) {
    const result = await pool.query(
      'SELECT * FROM fail_document_ingestion($1, $2)',
      [jobId, errorMessage]
    );

    logger.warn('Document ingestion job failed', {
      event: 'document_ingestion_job_failed',
      jobId,
    });

    return result.rows[0] || null;
  }
}

export { DocumentIngestionQueries };
export default new DocumentIngestionQueries();
