import workerManager from './worker.manager.js';
import { registerBirdIdentificationWorker } from './birdIdentification.worker.js';
import { registerEmbeddingWorker } from './embedding.worker.js';
import { registerIngestionWorker } from './ingestion.worker.js';
import env from '../config/env.js';
import queueManager, { registerQueues } from '../queues/index.js';
import logger from '../utils/logger.js';

const registerWorkers = (manager = workerManager) => ({
  birdIdentificationWorker: registerBirdIdentificationWorker(manager),
  embeddingWorker: registerEmbeddingWorker(manager),
  ingestionWorker: registerIngestionWorker(manager),
});

const startWorkers = async () => {
  registerQueues(queueManager);
  registerWorkers(workerManager);

  await workerManager.startAll();
  logger.info('Workers started', {
    environment: env.nodeEnv,
  });
};

const shutdownWorkers = async () => {
  logger.info('Shutting down workers');

  try {
    await workerManager.close();
    await queueManager.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to close worker infrastructure', {
      error: error.message,
    });
    process.exit(1);
  }
};

if (env.nodeEnv !== 'test') {
  startWorkers().catch((error) => {
    logger.error('Workers failed to start', {
      error: error.message,
    });
    process.exit(1);
  });

  process.on('SIGTERM', shutdownWorkers);
  process.on('SIGINT', shutdownWorkers);
}

export {
  registerWorkers,
  shutdownWorkers,
  startWorkers,
};
export default workerManager;
