import pool from '../db/pool.js';
import env from '../config/env.js';
import { getRuntimeRedisClient } from '../cache/runtimeRedis.js';
import { isShuttingDown } from '../runtime/lifecycleState.js';

function withTimeout(operation, timeoutMs, dependency) {
  let timeout;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => resolve({
      dependency,
      status: 'unavailable',
      reason: 'timeout',
    }), timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([
    Promise.resolve()
      .then(operation)
      .then(() => ({ dependency, status: 'ok' }))
      .catch(() => ({ dependency, status: 'unavailable', reason: 'error' })),
    timeoutPromise,
  ]).finally(() => clearTimeout(timeout));
}

function createReadinessChecker({
  database = pool,
  redisClientProvider = getRuntimeRedisClient,
  timeoutMs = env.dependencyHealthTimeoutMs,
  clock = Date,
  cacheTtlMs = 1000,
  shutdownCheck = isShuttingDown,
} = {}) {
  let cached = null;
  let inFlight = null;

  return async function checkReadiness() {
    if (shutdownCheck()) {
      return {
        status: 'unavailable',
        checks: {
          process: { status: 'unavailable', reason: 'shutting_down' },
        },
      };
    }

    const now = clock.now();
    if (cached && now - cached.checkedAt < cacheTtlMs) {
      return cached.result;
    }
    if (inFlight) return inFlight;

    inFlight = Promise.all([
      withTimeout(() => database.query('SELECT 1'), timeoutMs, 'postgres'),
      withTimeout(async () => {
        const client = await redisClientProvider();
        await client.ping();
      }, timeoutMs, 'redis'),
    ]).then((results) => {
      const checks = Object.fromEntries(
        results.map(({ dependency, ...check }) => [dependency, check])
      );
      const result = {
        status: results.every(({ status }) => status === 'ok') ? 'ok' : 'unavailable',
        checks,
      };
      cached = { checkedAt: clock.now(), result };
      return result;
    }).finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

const checkReadiness = createReadinessChecker();

export {
  createReadinessChecker,
  withTimeout,
};
export default checkReadiness;
