import { jest } from '@jest/globals';
import { JOB_TYPES, QUEUE_NAMES } from '../../src/jobs/jobTypes.js';
import { QueueManager } from '../../src/queues/queue.manager.js';

class MockQueue {
  static instances = [];

  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.add = jest.fn().mockResolvedValue({ id: 'job-1' });
    this.close = jest.fn().mockResolvedValue(undefined);
    this.getJob = jest.fn();
    MockQueue.instances.push(this);
  }
}

class MockQueueEvents {
  static instances = [];

  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.on = jest.fn();
    this.close = jest.fn().mockResolvedValue(undefined);
    MockQueueEvents.instances.push(this);
  }
}

const createTracer = () => ({
  recordEvent: jest.fn().mockResolvedValue(undefined),
  traceOperation: jest.fn((name, metadata, operation) => operation()),
});

describe('QueueManager', () => {
  beforeEach(() => {
    MockQueue.instances = [];
    MockQueueEvents.instances = [];
  });

  it('registers queues with shared Redis connection and queue events', () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
    };
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 2,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger,
      tracer: createTracer(),
    });

    const queue = manager.registerQueue(QUEUE_NAMES.BIRD_IDENTIFICATION);

    expect(queue).toBe(MockQueue.instances[0]);
    expect(queue.options).toEqual(expect.objectContaining({
      connection: { url: 'redis://localhost:6379' },
      prefix: 'jobs:',
    }));
    expect(MockQueueEvents.instances[0].on).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(MockQueueEvents.instances[0].on).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(MockQueueEvents.instances[0].on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(manager.registerQueue(QUEUE_NAMES.BIRD_IDENTIFICATION)).toBe(queue);
  });

  it('traces queue creation only for the initial registration', () => {
    const tracer = createTracer();
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 2,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {},
      tracer,
    });

    const firstQueue = manager.registerQueue(QUEUE_NAMES.EMBEDDING);
    const secondQueue = manager.registerQueue(QUEUE_NAMES.EMBEDDING);

    expect(secondQueue).toBe(firstQueue);
    expect(tracer.recordEvent).toHaveBeenCalledTimes(1);
    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_queue_registered',
      {
        queueName: QUEUE_NAMES.EMBEDDING,
        hasQueueEvents: true,
      },
      {
        status: 'registered',
      }
    );
  });

  it('adds jobs by known job type and rejects unknown job names', async () => {
    const tracer = createTracer();
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: null,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 3,
          backoffDelayMs: 500,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {},
      tracer,
    });
    manager.registerQueue(QUEUE_NAMES.EMBEDDING);

    await expect(manager.addJob(JOB_TYPES.EMBEDDING, { text: 'quetzal' }, {
      id: 'embedding-1',
    })).resolves.toEqual({ id: 'job-1' });

    expect(MockQueue.instances[0].add).toHaveBeenCalledWith(
      JOB_TYPES.EMBEDDING,
      { text: 'quetzal' },
      expect.objectContaining({
        jobId: 'embedding-1',
        attempts: 3,
      })
    );
    expect(tracer.traceOperation).toHaveBeenCalledWith(
      'bullmq_job_enqueue',
      expect.objectContaining({
        queueName: QUEUE_NAMES.EMBEDDING,
        jobType: JOB_TYPES.EMBEDDING,
        jobId: 'embedding-1',
        attempts: 3,
        backoffType: 'exponential',
      }),
      expect.any(Function),
      expect.objectContaining({
        outputMetadata: expect.any(Function),
      })
    );
    await expect(manager.addJob('unknown', {})).rejects.toThrow('Unknown job type');
  });

  it('closes queues and events gracefully', async () => {
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 1,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {},
      tracer: createTracer(),
    });
    manager.registerQueue(QUEUE_NAMES.INGESTION);

    await manager.close();

    expect(MockQueueEvents.instances[0].close).toHaveBeenCalledTimes(1);
    expect(MockQueue.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('moves exhausted failed jobs to the dead-letter queue with sanitized payloads', async () => {
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 3,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer: createTracer(),
    });
    const sourceQueue = manager.registerQueue(QUEUE_NAMES.EMBEDDING);
    const dlq = manager.registerQueue(QUEUE_NAMES.DEAD_LETTER, { registerEvents: false });
    sourceQueue.getJob.mockResolvedValue({
      id: 'embedding-1',
      name: JOB_TYPES.EMBEDDING,
      attemptsMade: 3,
      opts: {
        attempts: 3,
      },
      data: {
        documentId: 7,
        text: 'do not leak this',
        metadata: {
          prompt: 'hidden',
          traceId: 'trace-1',
        },
      },
    });

    const failedHandler = MockQueueEvents.instances[0].on.mock.calls
      .find(([eventName]) => eventName === 'failed')[1];

    await failedHandler({
      jobId: 'embedding-1',
      failedReason: 'provider timeout with raw details',
    });

    expect(dlq.add).toHaveBeenCalledWith(
      'dead-letter',
      expect.objectContaining({
        originalQueueName: QUEUE_NAMES.EMBEDDING,
        jobName: JOB_TYPES.EMBEDDING,
        jobId: 'embedding-1',
        attemptsMade: 3,
        configuredAttempts: 3,
        metadata: {
          documentId: '7',
          traceId: 'trace-1',
        },
      }),
      expect.objectContaining({
        attempts: 1,
      })
    );
    expect(dlq.add.mock.calls[0][1].metadata).not.toHaveProperty('text');
    expect(dlq.add.mock.calls[0][1].metadata).not.toHaveProperty('prompt');
  });

  it('traces dead-letter handoff for exhausted failed jobs', async () => {
    const tracer = createTracer();
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 3,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer,
    });
    const sourceQueue = manager.registerQueue(QUEUE_NAMES.BIRD_IDENTIFICATION);

    manager.registerQueue(QUEUE_NAMES.DEAD_LETTER, { registerEvents: false });
    sourceQueue.getJob.mockResolvedValue({
      id: 'bird-job-1',
      name: JOB_TYPES.BIRD_IDENTIFICATION,
      attemptsMade: 3,
      opts: {
        attempts: 3,
      },
      data: {
        jobId: 'bird-job-1',
      },
    });

    const failedHandler = MockQueueEvents.instances[0].on.mock.calls
      .find(([eventName]) => eventName === 'failed')[1];

    await failedHandler({
      jobId: 'bird-job-1',
      failedReason: 'provider timeout',
    });

    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_job_dead_lettered',
      expect.objectContaining({
        queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
        jobId: 'bird-job-1',
        attemptsMade: 3,
        configuredAttempts: 3,
      }),
      {
        status: 'dead_lettered',
      }
    );
  });

  it('does not move non-exhausted failures to the dead-letter queue', async () => {
    const tracer = createTracer();
    const manager = new QueueManager({
      QueueClass: MockQueue,
      QueueEventsClass: MockQueueEvents,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        deadLetter: {
          enabled: true,
          queueName: 'dead-letter',
        },
        defaultJobOptions: {
          attempts: 3,
          backoffDelayMs: 100,
          removeOnCompleteAgeSeconds: 60,
          removeOnCompleteCount: 10,
          removeOnFailAgeSeconds: 120,
          removeOnFailCount: 20,
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer,
    });
    const sourceQueue = manager.registerQueue(QUEUE_NAMES.INGESTION);
    const dlq = manager.registerQueue(QUEUE_NAMES.DEAD_LETTER, { registerEvents: false });
    sourceQueue.getJob.mockResolvedValue({
      id: 'ingestion-1',
      name: JOB_TYPES.INGESTION,
      attemptsMade: 2,
      opts: {
        attempts: 3,
      },
      data: {
        jobId: 'ingestion-1',
      },
    });

    const failedHandler = MockQueueEvents.instances[0].on.mock.calls
      .find(([eventName]) => eventName === 'failed')[1];

    await failedHandler({
      jobId: 'ingestion-1',
      failedReason: 'temporary failure',
    });

    expect(dlq.add).not.toHaveBeenCalled();
    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_job_retry_scheduled',
      expect.objectContaining({
        queueName: QUEUE_NAMES.INGESTION,
        jobId: 'ingestion-1',
        nextAttempt: 3,
        configuredAttempts: 3,
      }),
      {
        status: 'retry_scheduled',
      }
    );
  });
});
