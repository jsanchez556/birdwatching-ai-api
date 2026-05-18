import express from 'express';
import routes from './routes/index.routes.js';
import errorMiddleware from './middleware/error.middleware.js';
import rateLimit from './middleware/rateLimit.middleware.js';
import {
  corsProtection,
  sanitizeRequest,
  securityHeaders,
} from './middleware/security.middleware.js';
import HttpError from './utils/httpError.js';
import logger from './utils/logger.js';

const app = express();

app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(corsProtection);
app.use(express.json({ limit: '64kb' }));
app.use(sanitizeRequest);
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip || req.connection.remoteAddress,
    });
  });

  next();
});
app.use(rateLimit);
app.use(routes);
app.use((req, res, next) => {
  next(new HttpError(404, 'Route not found', { code: 'NOT_FOUND' }));
});
app.use(errorMiddleware);

export default app;
