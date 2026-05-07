import logger from '../utils/logger.js';
import { sendError } from '../utils/apiResponse.js';

export default function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const isServerError = status >= 500;
  const error = {
    message: isServerError ? 'Internal server error' : err.message || 'Unexpected error',
    code: isServerError ? 'INTERNAL_SERVER_ERROR' : err.code || 'REQUEST_ERROR',
  };

  if (err.details) {
    error.details = err.details;
  }

  logger[isServerError ? 'error' : 'warn']('Request failed', {
    status,
    message: err.message,
    url: req.originalUrl,
    method: req.method,
    stack: isServerError ? err.stack : undefined,
  });

  return sendError(res, error, status);
}
