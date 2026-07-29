import logger from '../../utils/logger.js';
import { sendError } from '../../utils/apiResponse.js';

export default function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const isServerError = status >= 500;
  const shouldMask = isServerError && !err.expose;
  const error = {
    message: shouldMask ? 'Internal server error' : err.message || 'Unexpected error',
    code: shouldMask ? 'INTERNAL_SERVER_ERROR' : err.code || 'REQUEST_ERROR',
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

  return sendError(res, error, status, err.meta || {});
}
