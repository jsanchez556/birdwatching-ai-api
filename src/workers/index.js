import workerManager from './worker.manager.js';
import { registerBirdIdentificationWorker } from './birdIdentification.worker.js';
import { registerEmbeddingWorker } from './embedding.worker.js';
import { registerIngestionWorker } from './ingestion.worker.js';
import env from '../config/env.js';
import queueManager, { registerQueues } from '../queues/index.js';
import logger from '../utils/logger.js';
import pool from '../db/pool.js';
import { closeRuntimeRedisClient } from '../cache/runtimeRedis.js';
import { markShuttingDown } from '../runtime/lifecycleState.js';
import { createShutdownController } from '../runtime/shutdown.js';

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

const createWorkerShutdown = ({
  workers = workerManager,
  queues = queueManager,
  database = pool,
  closeRedis = closeRuntimeRedisClient,
  graceMs = env.shutdownGracePeriodMs,
  hardTimeoutMs = env.shutdownHardTimeoutMs,
  log = logger,
} = {}) => createShutdownController({
  markUnready: markShuttingDown,
  stopAccepting: () => workers.close(),
  forceStop: () => {
    for (const worker of workers.workers?.values?.() || []) {
      worker.close?.(true);
    }
  },
  cleanupTasks: [
    { name: 'queues', close: () => queues.close() },
    { name: 'redis', close: closeRedis },
    { name: 'postgres', close: () => database.end() },
  ],
  graceMs,
  hardTimeoutMs,
  log,
});

const shutdownWorkers = createWorkerShutdown();

if (env.nodeEnv !== 'test') {
  startWorkers().catch((error) => {
    logger.error('Workers failed to start', {
      code: error.code || 'WORKER_START_FAILED',
    });
    process.exit(1);
  });

  let signalHandled = false;
  const handleSignal = (signal) => {
    if (signalHandled) return;
    signalHandled = true;
    shutdownWorkers(signal).then(({ exitCode }) => process.exit(exitCode));
  };
  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);
}

export {
  createWorkerShutdown,
  registerWorkers,
  shutdownWorkers,
  startWorkers,
};
export default workerManager;
