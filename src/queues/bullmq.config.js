import { parsePositiveInteger } from '../utils/number.utils.js';

const buildBullMqConnectionOptions = (redisUrl = 'redis://localhost:6379') => {
  const parsedUrl = new URL(redisUrl);
  const pathname = parsedUrl.pathname.replace('/', '');
  const db = pathname ? Number(pathname) : undefined;

  if (db !== undefined && Number.isNaN(db)) {
    throw new Error('REDIS_URL database index must be a number');
  }

  return Object.fromEntries(Object.entries({
    host: parsedUrl.hostname || 'localhost',
    port: parsedUrl.port ? Number(parsedUrl.port) : 6379,
    username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
    password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
    db,
    tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  }).filter(([, value]) => value !== undefined));
};

const getBullMqConfig = (env = process.env) => ({
  connection: buildBullMqConnectionOptions(env.REDIS_URL || 'redis://localhost:6379'),
  prefix: env.BULLMQ_KEY_PREFIX || env.REDIS_KEY_PREFIX || 'birdwatching-ai:jobs',
  deadLetter: {
    enabled: env.BULLMQ_DLQ_ENABLED !== 'false',
    queueName: env.BULLMQ_DLQ_QUEUE_NAME || 'dead-letter',
  },
  defaultJobOptions: {
    attempts: parsePositiveInteger(env.BULLMQ_JOB_ATTEMPTS, 3),
    backoffDelayMs: parsePositiveInteger(env.BULLMQ_JOB_BACKOFF_DELAY_MS, 5_000),
    removeOnCompleteAgeSeconds: parsePositiveInteger(
      env.BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS,
      24 * 60 * 60
    ),
    removeOnCompleteCount: parsePositiveInteger(env.BULLMQ_REMOVE_ON_COMPLETE_COUNT, 1_000),
    removeOnFailAgeSeconds: parsePositiveInteger(
      env.BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS,
      7 * 24 * 60 * 60
    ),
    removeOnFailCount: parsePositiveInteger(env.BULLMQ_REMOVE_ON_FAIL_COUNT, 5_000),
  },
  workerConcurrency: parsePositiveInteger(env.BULLMQ_WORKER_CONCURRENCY, 2),
});

const buildBullMqJobOptions = (config = getBullMqConfig()) => ({
  attempts: config.defaultJobOptions.attempts,
  backoff: {
    type: 'exponential',
    delay: config.defaultJobOptions.backoffDelayMs,
  },
  removeOnComplete: {
    age: config.defaultJobOptions.removeOnCompleteAgeSeconds,
    count: config.defaultJobOptions.removeOnCompleteCount,
  },
  removeOnFail: {
    age: config.defaultJobOptions.removeOnFailAgeSeconds,
    count: config.defaultJobOptions.removeOnFailCount,
  },
});

export {
  buildBullMqConnectionOptions,
  buildBullMqJobOptions,
  getBullMqConfig,
};
