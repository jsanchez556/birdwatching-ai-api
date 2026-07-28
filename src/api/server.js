import app from './app.js';
import env from '../config/env.js';
import queueManager, { registerQueues } from '../queues/index.js';
import logger from '../utils/logger.js';
import analytics from '../analytics/analytics.service.js';
import featureFlags from '../featureFlags/featureFlag.service.js';

const port = env.port;

const startApiServer = () => {
  registerQueues(queueManager);

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`API server running on port ${port}`, {
      environment: env.nodeEnv,
    });
  });

  server.on('error', (error) => {
    logger.error('API server failed to start', {
      error: error.message,
      code: error.code,
    });
    process.exit(1);
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    server.close(async () => {
      try {
        await queueManager.close();
        await analytics.shutdown();
        await featureFlags.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Failed to close queue infrastructure', {
          error: error.message,
        });
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
};

if (env.nodeEnv !== 'test') {
  startApiServer();
}

export {
  startApiServer,
};
