import { randomUUID } from 'crypto';
import birdIdentificationImageStorage from './birdIdentificationImageStorage.service.js';
import birdIdentificationQueries from '../db/queries/birdIdentification.queries.js';
import jobsQueries from '../db/queries/jobs.queries.js';
import env from '../config/env.js';
import { JOB_STATUSES, JOB_TYPES } from '../jobs/jobTypes.js';
import { registerBirdIdentificationQueue } from '../queues/birdIdentification.queue.js';
import logger from '../utils/logger.js';

const SAFE_BIRD_IDENTIFICATION_ERROR = 'Bird identification failed. Please try again.';
const STALLABLE_JOB_STATUSES = new Set([
  JOB_STATUSES.QUEUED,
  JOB_STATUSES.ACTIVE,
]);

function normalizeUserId(userId) {
  const normalized = Number(userId);

  return Number.isFinite(normalized) ? normalized : null;
}

function splitIdentificationResult(result = {}) {
  const {
    promptVersions,
    model,
    providerRequestId,
    ragTrace,
    debug,
    ...identification
  } = result;

  return {
    result: identification,
    meta: {
      promptVersions,
      model,
      ragTrace,
      ...(debug ? { debug } : {}),
    },
  };
}

function getIdentificationSummary(result = {}) {
  const prediction = result.bestMatch?.commonName
    || result.bestMatch?.species
    || result.candidates?.[0]?.commonName
    || result.candidates?.[0]?.species
    || null;
  const confidence = Number(result.bestMatch?.confidence ?? result.candidates?.[0]?.confidence);

  return {
    prediction,
    confidence: Number.isFinite(confidence) ? confidence : null,
  };
}

function formatJobRow(row) {
  if (!row) {
    return {
      status: JOB_STATUSES.NOT_FOUND,
    };
  }

  const response = {
    jobId: row.job_id,
    status: row.status,
  };

  if (row.status === JOB_STATUSES.COMPLETED) {
    response.result = row.result || {};
  }

  if (row.status === JOB_STATUSES.FAILED) {
    response.error = {
      message: row.error_message || SAFE_BIRD_IDENTIFICATION_ERROR,
    };
  }

  return response;
}

function isStalledJob(row, stallTimeoutMs = env.birdIdentificationJobStallTimeoutMs, now = Date.now()) {
  if (!row || !STALLABLE_JOB_STATUSES.has(row.status)) {
    return false;
  }

  const updatedAt = row.updated_at || row.created_at;
  const updatedAtMs = updatedAt instanceof Date
    ? updatedAt.getTime()
    : new Date(updatedAt).getTime();

  return Number.isFinite(updatedAtMs) && now - updatedAtMs >= stallTimeoutMs;
}

class BirdIdentificationJobService {
  constructor({
    queries = jobsQueries,
    historyQueries = birdIdentificationQueries,
    imageStorage = birdIdentificationImageStorage,
    queueFactory = registerBirdIdentificationQueue,
    stallTimeoutMs = env.birdIdentificationJobStallTimeoutMs,
  } = {}) {
    this.queries = queries;
    this.historyQueries = historyQueries;
    this.imageStorage = imageStorage;
    this.queueFactory = queueFactory;
    this.stallTimeoutMs = stallTimeoutMs;
  }

  async enqueueIdentification({ imageUrl, imageUpload, userId, metadata = {} }) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      throw new Error('userId is required for bird identification jobs');
    }

    const preparedImageUrl = await this.prepareImageUrl({
      imageUrl,
      imageUpload,
      userId: normalizedUserId,
    });
    const jobId = randomUUID();

    await this.queries.createJob({
      jobId,
      jobType: JOB_TYPES.BIRD_IDENTIFICATION,
      userId: normalizedUserId,
      requestParams: {
        imageUrl: preparedImageUrl,
      },
    });

    try {
      const queue = this.queueFactory();

      await queue.add(JOB_TYPES.BIRD_IDENTIFICATION, {
        jobId,
        imageUrl: preparedImageUrl,
        userId: normalizedUserId,
        metadata: {
          parentTraceId: metadata.parentTraceId,
          debug: Boolean(metadata.debug),
        },
      }, {
        jobId,
      });
    } catch (error) {
      await this.queries.failJob({
        jobId,
        errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
      });
      logger.warn('Failed to enqueue bird identification job', {
        event: 'bird_identification_job_enqueue_failed',
        error: error.message,
      });
      throw error;
    }

    return {
      jobId,
      status: JOB_STATUSES.QUEUED,
    };
  }

  async prepareImageUrl({ imageUrl, imageUpload, userId }) {
    if (imageUpload?.buffer?.length) {
      const storedImage = await this.imageStorage.uploadIdentificationImage({
        imageUpload,
        userId,
      });

      return storedImage.imageUrl;
    }

    return imageUrl;
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
      jobType: JOB_TYPES.BIRD_IDENTIFICATION,
    });

    if (isStalledJob(row, this.stallTimeoutMs)) {
      logger.warn('Bird identification job stalled', {
        event: 'bird_identification_job_stalled',
        status: row.status,
      });

      const failedRow = await this.queries.failJob({
        jobId,
        errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
      });

      return {
        jobId,
        ...formatJobRow(failedRow || {
          ...row,
          status: JOB_STATUSES.FAILED,
          error_message: SAFE_BIRD_IDENTIFICATION_ERROR,
        }),
      };
    }

    return {
      jobId,
      ...formatJobRow(row),
    };
  }

  async markActive({ jobId }) {
    return this.queries.markActive({ jobId });
  }

  async completeJob({ jobId, identification }) {
    const { result, meta } = splitIdentificationResult(identification);
    const row = typeof this.queries.getJobForProcessing === 'function'
      ? await this.queries.getJobForProcessing({
        jobId,
        jobType: JOB_TYPES.BIRD_IDENTIFICATION,
      })
      : null;

    const completedJob = await this.queries.completeJob({
      jobId,
      result,
      meta,
    });

    if (row?.user_id && row?.request_params?.imageUrl) {
      const { prediction, confidence } = getIdentificationSummary(result);

      try {
        await this.historyQueries.createHistory({
          userId: row.user_id,
          imageUrl: row.request_params.imageUrl,
          prediction,
          confidence,
          result,
          meta,
        });
      } catch {
        logger.warn('Failed to save completed bird identification history', {
          event: 'bird_identification_history_save_failed',
          jobType: JOB_TYPES.BIRD_IDENTIFICATION,
        });
      }
    }

    return completedJob;
  }

  async failJob({ jobId }) {
    return this.queries.failJob({
      jobId,
      errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
    });
  }
}

export {
  BirdIdentificationJobService,
  SAFE_BIRD_IDENTIFICATION_ERROR,
  formatJobRow,
  getIdentificationSummary,
  isStalledJob,
  splitIdentificationResult,
};
export default new BirdIdentificationJobService();
