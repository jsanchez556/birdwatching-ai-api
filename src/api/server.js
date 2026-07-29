import app from './app.js';
import env from '../config/env.js';
import queueManager, { registerQueues } from '../queues/index.js';
import logger from '../utils/logger.js';
import analytics from '../analytics/analytics.service.js';
import featureFlags from '../featureFlags/featureFlag.service.js';
import pool from '../db/pool.js';
import { closeRuntimeRedisClient } from '../cache/runtimeRedis.js';
import { markShuttingDown } from '../runtime/lifecycleState.js';
import { createShutdownController } from '../runtime/shutdown.js';

const port = env.port;

const createApiShutdown = ({
  server,
  queues = queueManager,
  analyticsService = analytics,
  featureFlagService = featureFlags,
  database = pool,
  closeRedis = closeRuntimeRedisClient,
  graceMs = env.shutdownGracePeriodMs,
  hardTimeoutMs = env.shutdownHardTimeoutMs,
  log = logger,
} = {}) => createShutdownController({
  markUnready: markShuttingDown,
  stopAccepting: () => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
  }),
  forceStop: () => server.closeAllConnections?.(),
  cleanupTasks: [
    { name: 'queues', close: () => queues.close() },
    { name: 'analytics', close: () => analyticsService.shutdown() },
    { name: 'feature-flags', close: () => featureFlagService.shutdown() },
    { name: 'redis', close: closeRedis },
    { name: 'postgres', close: () => database.end() },
  ],
  graceMs,
  hardTimeoutMs,
  log,
});

const startApiServer = () => {
  registerQueues(queueManager);

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`API server running on port ${port}`, {
      environment: env.nodeEnv,
    });
  });

  server.on('error', (error) => {
    logger.error('API server failed to start', {
      code: error.code || 'API_SERVER_START_FAILED',
    });
    process.exit(1);
  });

  const shutdown = createApiShutdown({ server });
  let signalHandled = false;
  const handleSignal = (signal) => {
    if (signalHandled) return;
    signalHandled = true;
    shutdown(signal).then(({ exitCode }) => process.exit(exitCode));
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);

  return server;
};

if (env.nodeEnv !== 'test') {
  startApiServer();
}

export {
  createApiShutdown,
  startApiServer,
};
