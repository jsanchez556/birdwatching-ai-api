import jobsQueries from '../db/queries/jobs.queries.js';
import { JOB_STATUSES, JOB_TYPES } from '../jobs/jobTypes.js';

const SAFE_BIRD_IDENTIFICATION_ERROR = 'Bird identification failed. Please try again.';
const SAFE_DOCUMENT_INGESTION_ERROR = 'Document ingestion failed. Please try again.';

const SAFE_ERROR_BY_JOB_TYPE = Object.freeze({
  [JOB_TYPES.BIRD_IDENTIFICATION]: SAFE_BIRD_IDENTIFICATION_ERROR,
  [JOB_TYPES.INGESTION]: SAFE_DOCUMENT_INGESTION_ERROR,
});

function normalizeUserId(userId) {
  const normalized = Number(userId);

  return Number.isFinite(normalized) ? normalized : null;
}

function formatJobStatusRow(row) {
  if (!row) {
    return {
      status: JOB_STATUSES.NOT_FOUND,
    };
  }

  const response = {
    jobId: row.job_id,
    jobType: row.job_type,
    status: row.status,
  };

  if (row.status === JOB_STATUSES.COMPLETED) {
    response.result = row.result || {};
    if (row.result_meta && Object.keys(row.result_meta).length > 0) {
      response.meta = row.result_meta;
    }
  }

  if (row.status === JOB_STATUSES.FAILED) {
    response.error = {
      message: row.error_message
        || SAFE_ERROR_BY_JOB_TYPE[row.job_type]
        || 'Job failed. Please try again.',
    };
  }

  return response;
}

class JobStatusService {
  constructor({
    queries = jobsQueries,
  } = {}) {
    this.queries = queries;
  }

  async getJobStatus({ jobId, userId }) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return {
        jobId,
        status: JOB_STATUSES.NOT_FOUND,
      };
    }

    const row = await this.queries.getJob({
      jobId,
      userId: normalizedUserId,
    });

    return {
      jobId,
      ...formatJobStatusRow(row),
    };
  }
}

export { JobStatusService, formatJobStatusRow, formatJobStatusRow as formatJobRow };
export default new JobStatusService();
