import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';

const port = env.port;

if (env.nodeEnv !== 'test') {
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on port ${port}`, {
      environment: env.nodeEnv,
    });
  });

  server.on('error', (error) => {
    logger.error('Server failed to start', {
      error: error.message,
      code: error.code,
    });
    process.exit(1);
  });
}
