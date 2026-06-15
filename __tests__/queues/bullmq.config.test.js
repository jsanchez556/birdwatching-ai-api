import {
  buildBullMqConnectionOptions,
  buildBullMqJobOptions,
  getBullMqConfig,
} from '../../src/queues/bullmq.config.js';

describe('BullMQ config', () => {
  it('uses Redis URL and BullMQ environment overrides', () => {
    const config = getBullMqConfig({
      REDIS_URL: 'redis://user:secret@queue.example.test:6380/2',
      REDIS_KEY_PREFIX: 'cache:',
      BULLMQ_KEY_PREFIX: 'jobs:',
      BULLMQ_JOB_ATTEMPTS: '4',
      BULLMQ_JOB_BACKOFF_DELAY_MS: '2500',
      BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS: '60',
      BULLMQ_REMOVE_ON_COMPLETE_COUNT: '10',
      BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS: '120',
      BULLMQ_REMOVE_ON_FAIL_COUNT: '20',
      BULLMQ_WORKER_CONCURRENCY: '6',
      BULLMQ_DLQ_ENABLED: 'false',
      BULLMQ_DLQ_QUEUE_NAME: 'ai-dlq',
    });

    expect(config).toEqual({
      connection: {
        host: 'queue.example.test',
        port: 6380,
        username: 'user',
        password: 'secret',
        db: 2,
        maxRetriesPerRequest: null,
      },
      prefix: 'jobs:',
      deadLetter: {
        enabled: false,
        queueName: 'ai-dlq',
      },
      defaultJobOptions: {
        attempts: 4,
        backoffDelayMs: 2500,
        removeOnCompleteAgeSeconds: 60,
        removeOnCompleteCount: 10,
        removeOnFailAgeSeconds: 120,
        removeOnFailCount: 20,
      },
      workerConcurrency: 6,
    });
  });

  it('enables the dead-letter queue by default', () => {
    expect(getBullMqConfig({}).deadLetter).toEqual({
      enabled: true,
      queueName: 'dead-letter',
    });
  });

  it('builds BullMQ job options from config', () => {
    expect(buildBullMqJobOptions(getBullMqConfig({
      BULLMQ_JOB_ATTEMPTS: '2',
      BULLMQ_JOB_BACKOFF_DELAY_MS: '100',
      BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS: '200',
      BULLMQ_REMOVE_ON_COMPLETE_COUNT: '3',
      BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS: '400',
      BULLMQ_REMOVE_ON_FAIL_COUNT: '5',
    }))).toEqual({
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 100,
      },
      removeOnComplete: {
        age: 200,
        count: 3,
      },
      removeOnFail: {
        age: 400,
        count: 5,
      },
    });
  });

  it('parses rediss URLs with TLS enabled', () => {
    expect(buildBullMqConnectionOptions('rediss://cache.example.test:6380/1')).toEqual({
      host: 'cache.example.test',
      port: 6380,
      db: 1,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });
});
