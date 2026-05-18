import HttpError from '../utils/httpError.js';
import env from '../config/env.js';

function defaultKeyGenerator(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function setRateLimitHeaders(res, limit, remaining, resetAt) {
  const resetSeconds = Math.ceil(resetAt / 1000);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));
}

function createRateLimit({
  windowMs = 60 * 1000,
  maxRequests = 60,
  keyGenerator = defaultKeyGenerator,
  message = 'Too many requests. Please try again later.',
  code = 'RATE_LIMITED',
} = {}) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const key = keyGenerator(req) || defaultKeyGenerator(req);
    const limit = Math.max(1, maxRequests);
    const windowLength = Math.max(1000, windowMs);
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowLength };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowLength;
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    setRateLimitHeaders(res, limit, limit - bucket.count, bucket.resetAt);

    if (bucket.count > limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));

      return next(new HttpError(429, message, { code }));
    }

    return next();
  };
}

export const aiRateLimit = createRateLimit({
  windowMs: env.aiRateLimitWindowMs,
  maxRequests: env.aiRateLimitMaxRequests,
  keyGenerator: (req) => req.user?.id || req.user?.email || defaultKeyGenerator(req),
  code: 'AI_RATE_LIMITED',
});

export const visitorAiRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `visitor:${defaultKeyGenerator(req)}`,
  message: 'Visitor chat limit reached. Please log in to continue planning.',
  code: 'VISITOR_RATE_LIMITED',
});

const rateLimit = createRateLimit({
  windowMs: env.rateLimitWindowMs,
  maxRequests: env.rateLimitMaxRequests,
});

export default rateLimit;
