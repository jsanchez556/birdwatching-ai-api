import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from '../queues/index.js';

const QUEUE_COUNT_TYPES = Object.freeze([
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
]);

const QUEUE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'bird-identification',
    name: 'Bird Identification',
    queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
  }),
  Object.freeze({
    id: 'embeddings',
    name: 'Embeddings',
    queueName: QUEUE_NAMES.EMBEDDING,
  }),
  Object.freeze({
    id: 'document-ingestion',
    name: 'Document Ingestion',
    queueName: QUEUE_NAMES.INGESTION,
  }),
]);

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

class QueueHealthService {
  constructor({ queues = queueManager } = {}) {
    this.queues = queues;
  }

  async getStatistics() {
    const queues = await Promise.all(QUEUE_DEFINITIONS.map(async (definition) => {
      const queue = this.queues.getQueue(definition.queueName);
      const counts = await queue.getJobCounts(...QUEUE_COUNT_TYPES);

      return {
        id: definition.id,
        name: definition.name,
        waiting: normalizeCount(counts.waiting),
        active: normalizeCount(counts.active),
        completed: normalizeCount(counts.completed),
        failed: normalizeCount(counts.failed),
        delayed: normalizeCount(counts.delayed),
      };
    }));

    return { queues };
  }
}

export {
  QUEUE_COUNT_TYPES,
  QUEUE_DEFINITIONS,
  QueueHealthService,
};
export default new QueueHealthService();
