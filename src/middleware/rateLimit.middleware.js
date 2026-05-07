import HttpError from '../utils/httpError.js';

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;
const buckets = new Map();

export default function rateLimit(req, res, next) {
  const key = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > MAX_REQUESTS) {
    return next(new HttpError(429, 'Too many requests', { code: 'RATE_LIMITED' }));
  }

  return next();
}
