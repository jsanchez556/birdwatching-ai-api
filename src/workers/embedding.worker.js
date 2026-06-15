import { JOB_TYPES, QUEUE_NAMES, WORKER_NAMES } from '../jobs/jobTypes.js';
import { createNonRetryableJobError } from '../jobs/jobErrors.js';
import embeddingJobService from '../ai/services/embeddingJob.service.js';
import workerManager from './worker.manager.js';

const createEmbeddingProcessor = ({
  jobService = embeddingJobService,
} = {}) => async (job) => {
  if (job?.name !== JOB_TYPES.EMBEDDING) {
    throw createNonRetryableJobError(`Unsupported embedding job: ${job?.name}`);
  }

  const { documentId } = job.data || {};

  if (!documentId) {
    throw createNonRetryableJobError('Embedding job payload is invalid');
  }

  return jobService.processDocumentEmbedding({
    documentId,
  });
};

const processEmbeddingJob = createEmbeddingProcessor();

const registerEmbeddingWorker = (manager = workerManager) =>
  manager.registerWorker({
    queueName: QUEUE_NAMES.EMBEDDING,
    workerName: WORKER_NAMES.EMBEDDING,
    processor: processEmbeddingJob,
  });

const embeddingWorker = {
  name: WORKER_NAMES.EMBEDDING,
  queueName: QUEUE_NAMES.EMBEDDING,
  register: registerEmbeddingWorker,
};

export {
  createEmbeddingProcessor,
  embeddingWorker,
  processEmbeddingJob,
  registerEmbeddingWorker,
};
export default embeddingWorker;
