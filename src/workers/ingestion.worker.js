import { JOB_TYPES, QUEUE_NAMES, WORKER_NAMES } from '../jobs/jobTypes.js';
import { createNonRetryableJobError, isFinalJobAttempt } from '../jobs/jobErrors.js';
import documentIngestionService from '../services/documentIngestion.service.js';
import workerManager from './worker.manager.js';

const createIngestionProcessor = ({
  ingestionService = documentIngestionService,
} = {}) => async (job) => {
  if (job?.name !== JOB_TYPES.INGESTION) {
    throw createNonRetryableJobError(`Unsupported ingestion job: ${job?.name}`);
  }

  const { jobId = job.id } = job.data || {};

  if (!jobId) {
    throw createNonRetryableJobError('Ingestion job payload is invalid');
  }

  return ingestionService.processIngestion({
    jobId,
    finalAttempt: isFinalJobAttempt(job),
  });
};

const processIngestionJob = createIngestionProcessor();

const registerIngestionWorker = (manager = workerManager) =>
  manager.registerWorker({
    queueName: QUEUE_NAMES.INGESTION,
    workerName: WORKER_NAMES.INGESTION,
    processor: processIngestionJob,
  });

const ingestionWorker = {
  name: WORKER_NAMES.INGESTION,
  queueName: QUEUE_NAMES.INGESTION,
  register: registerIngestionWorker,
};

export {
  createIngestionProcessor,
  ingestionWorker,
  processIngestionJob,
  registerIngestionWorker,
};
export default ingestionWorker;
