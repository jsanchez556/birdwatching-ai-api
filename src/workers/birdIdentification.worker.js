import { JOB_TYPES, QUEUE_NAMES, WORKER_NAMES } from '../jobs/jobTypes.js';
import { createNonRetryableJobError, isFinalJobAttempt } from '../jobs/jobErrors.js';
import birdIdentificationService from '../services/birdIdentification.service.js';
import birdIdentificationJobService from '../services/birdIdentificationJob.service.js';
import workerManager from './worker.manager.js';

const createBirdIdentificationProcessor = ({
  identificationService = birdIdentificationService,
  jobService = birdIdentificationJobService,
} = {}) => async (job) => {
  if (job?.name !== JOB_TYPES.BIRD_IDENTIFICATION) {
    throw createNonRetryableJobError(`Unsupported bird identification job: ${job?.name}`);
  }

  const {
    jobId = job.id,
    imageUrl,
    userId,
    metadata = {},
  } = job.data || {};

  if (!jobId || !imageUrl || userId === undefined || userId === null) {
    throw createNonRetryableJobError('Bird identification job payload is invalid');
  }

  try {
    await jobService.markActive({ jobId });

    const identification = await identificationService.identifyFromImage({
      imageUrl,
      userId,
      metadata: {
        ...metadata,
        jobId,
      },
    });

    await jobService.completeJob({
      jobId,
      identification,
    });

    return {
      jobId,
      status: 'completed',
    };
  } catch (error) {
    if (isFinalJobAttempt(job, error)) {
      await jobService.failJob({ jobId });
    }
    throw error;
  }
};

const processBirdIdentificationJob = createBirdIdentificationProcessor();

const registerBirdIdentificationWorker = (manager = workerManager) =>
  manager.registerWorker({
    queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
    workerName: WORKER_NAMES.BIRD_IDENTIFICATION,
    processor: processBirdIdentificationJob,
  });

const birdIdentificationWorker = {
  name: WORKER_NAMES.BIRD_IDENTIFICATION,
  queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
  register: registerBirdIdentificationWorker,
};

export {
  birdIdentificationWorker,
  createBirdIdentificationProcessor,
  processBirdIdentificationJob,
  registerBirdIdentificationWorker,
};
export default birdIdentificationWorker;
