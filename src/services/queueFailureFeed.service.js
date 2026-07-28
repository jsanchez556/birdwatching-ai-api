import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from '../queues/queue.manager.js';

const DEFAULT_SOURCE_LIMIT = 1000;
const DEAD_LETTER_STATES = Object.freeze([
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
]);

function asIsoTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

class QueueFailureFeedService {
  constructor({
    manager = queueManager,
    sourceLimit = DEFAULT_SOURCE_LIMIT,
  } = {}) {
    this.manager = manager;
    this.sourceLimit = sourceLimit;
  }

  async getRecentFailures({ startAt, endAt, limit = this.sourceLimit } = {}) {
    const queueName = this.manager.config.deadLetter?.queueName || QUEUE_NAMES.DEAD_LETTER;
    const queue = this.manager.getQueue(queueName);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || this.sourceLimit, this.sourceLimit));
    const jobs = await queue.getJobs(DEAD_LETTER_STATES, 0, boundedLimit - 1, false);
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();

    return jobs.flatMap((job) => {
      const payload = job?.data || {};
      const timestamp = asIsoTimestamp(payload.failedAt);
      const occurredAt = timestamp ? new Date(timestamp).getTime() : Number.NaN;

      if (!timestamp || occurredAt < start || occurredAt >= end) return [];

      const originalJobId = payload.jobId === undefined || payload.jobId === null
        ? null
        : String(payload.jobId);
      const originalQueueName = typeof payload.originalQueueName === 'string'
        ? payload.originalQueueName
        : 'unknown';
      const metadata = payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};

      return [{
        id: `dlq-${originalQueueName}-${originalJobId || job.id}`,
        timestamp,
        type: 'QUEUE_FAILURE',
        userId: metadata.userId ?? null,
        traceId: metadata.aiTraceId ?? metadata.traceId ?? null,
        dedupeKey: originalJobId ? `queue:${originalJobId}` : `dlq:${job.id}`,
      }];
    });
  }
}

export {
  DEAD_LETTER_STATES,
  DEFAULT_SOURCE_LIMIT,
  QueueFailureFeedService,
};
export default new QueueFailureFeedService();
