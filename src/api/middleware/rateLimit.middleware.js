import HttpError from '../../utils/httpError.js';
import env from '../../config/env.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import { getRuntimeRedisClient } from '../../cache/runtimeRedis.js';
import { buildHashKey } from '../../utils/hash.utils.js';
import logger from '../../utils/logger.js';

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const MAX_LOCAL_BUCKETS = 10000;

function defaultKeyGenerator(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function setRateLimitHeaders(res, limit, remaining, resetAt) {
  const resetSeconds = Math.ceil(resetAt / 1000);
  const resetDelaySeconds = Math.max(Math.ceil((resetAt - Date.now()) / 1000), 0);

  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(remaining, 0)));
  res.setHeader('RateLimit-Reset', String(resetDelaySeconds));
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));
}

class RedisFixedWindowStore {
  constructor({
    clientProvider = getRuntimeRedisClient,
    keyPrefix = `${process.env.REDIS_KEY_PREFIX || 'birdwatching-ai:'}rate-limit:`,
  } = {}) {
    this.clientProvider = clientProvider;
    this.keyPrefix = keyPrefix;
  }

  async increment(scope, identity, windowMs) {
    const client = await this.clientProvider();
    const key = buildHashKey(`${this.keyPrefix}${scope}`, identity);
    const result = await client.eval(FIXED_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [String(windowMs)],
    });
    const [count, ttlMs] = Array.from(result || [], Number);

    if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
      throw new Error('Redis rate limit response was invalid');
    }

    return {
      count,
      resetAt: Date.now() + Math.max(ttlMs, 1),
    };
  }
}

function createLocalFixedWindowStore({
  clock = Date,
  maxBuckets = MAX_LOCAL_BUCKETS,
} = {}) {
  const buckets = new Map();

  return {
    async increment(scope, identity, windowMs) {
      const now = clock.now();
      const key = `${scope}:${identity}`;
      let bucket = buckets.get(key);

      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
      }

      bucket.count += 1;
      buckets.delete(key);
      buckets.set(key, bucket);

      while (buckets.size > maxBuckets) {
        buckets.delete(buckets.keys().next().value);
      }

      return { ...bucket };
    },
    size() {
      return buckets.size;
    },
  };
}

function createRateLimit({
  windowMs = 60 * 1000,
  maxRequests = 60,
  keyGenerator = defaultKeyGenerator,
  message = 'Too many requests. Please try again later.',
  code = 'RATE_LIMITED',
  scope = 'global',
  store = env.nodeEnv === 'test'
    ? createLocalFixedWindowStore()
    : new RedisFixedWindowStore(),
  fallbackStore = createLocalFixedWindowStore(),
  failureMode = env.rateLimitRedisFailureMode,
  log = logger,
  clock = Date,
  operationTimeoutMs = env.dependencyHealthTimeoutMs,
} = {}) {
  let lastFailureLogAt = 0;

  return async function rateLimit(req, res, next) {
    if (req.path === '/health' || req.path?.startsWith('/health/')) {
      return next();
    }

    const key = keyGenerator(req) || defaultKeyGenerator(req);
    const limit = Math.max(1, maxRequests);
    const windowLength = Math.max(1000, windowMs);
    let bucket;

    try {
      let timeout;
      bucket = await Promise.race([
        store.increment(scope, key, windowLength),
        new Promise((resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Distributed rate limiter timed out')),
            operationTimeoutMs
          );
          timeout.unref?.();
        }),
      ]).finally(() => clearTimeout(timeout));
    } catch (error) {
      if (clock.now() - lastFailureLogAt >= 5000) {
        lastFailureLogAt = clock.now();
        log.warn?.('Distributed rate limiter unavailable', {
          mode: failureMode,
          scope,
        });
      }

      if (failureMode === 'deny') {
        return next(new HttpError(
          503,
          'Service temporarily unavailable. Please try again later.',
          { code: 'RATE_LIMIT_UNAVAILABLE' }
        ));
      }

      bucket = await fallbackStore.increment(scope, key, windowLength);
    }

    setRateLimitHeaders(res, limit, limit - bucket.count, bucket.resetAt);

    if (bucket.count > limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - clock.now()) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      aiTelemetry.recordAiError('rate_limit', {
        code,
        aiTraceId: req.aiTraceId,
      });

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
  scope: 'ai',
});

export const visitorAiRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `visitor:${defaultKeyGenerator(req)}`,
  message: 'Visitor chat limit reached. Please log in to continue planning.',
  code: 'VISITOR_RATE_LIMITED',
  scope: 'visitor-ai',
});

const rateLimit = createRateLimit({
  windowMs: env.rateLimitWindowMs,
  maxRequests: env.rateLimitMaxRequests,
  scope: 'global',
});

export {
  FIXED_WINDOW_SCRIPT,
  RedisFixedWindowStore,
  createLocalFixedWindowStore,
  createRateLimit,
};
export default rateLimit;
