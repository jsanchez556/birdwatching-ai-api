import { jest } from '@jest/globals';
import { QUEUE_NAMES, WORKER_NAMES } from '../../src/jobs/jobTypes.js';
import { WorkerManager } from '../../src/workers/worker.manager.js';

class MockWorker {
  static instances = [];

  constructor(queueName, processor, options) {
    this.queueName = queueName;
    this.processor = processor;
    this.options = options;
    this.on = jest.fn();
    this.run = jest.fn().mockResolvedValue(undefined);
    this.close = jest.fn().mockResolvedValue(undefined);
    MockWorker.instances.push(this);
  }
}

const createTracer = () => ({
  recordEvent: jest.fn().mockResolvedValue(undefined),
  traceOperation: jest.fn((name, metadata, operation) => operation()),
});

describe('WorkerManager', () => {
  beforeEach(() => {
    MockWorker.instances = [];
  });

  it('registers workers without autorun and attaches events', () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
    };
    const manager = new WorkerManager({
      WorkerClass: MockWorker,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        workerConcurrency: 4,
      },
      logger,
      tracer: createTracer(),
    });
    const processor = jest.fn();

    const worker = manager.registerWorker({
      queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
      workerName: WORKER_NAMES.BIRD_IDENTIFICATION,
      processor,
    });

    expect(worker).toBe(MockWorker.instances[0]);
    expect(worker.options).toEqual({
      connection: { url: 'redis://localhost:6379' },
      prefix: 'jobs:',
      concurrency: 4,
      autorun: false,
    });
    expect(worker.on).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(manager.registerWorker({
      queueName: QUEUE_NAMES.BIRD_IDENTIFICATION,
      workerName: WORKER_NAMES.BIRD_IDENTIFICATION,
      processor,
    })).toBe(worker);
  });

  it('starts and closes registered workers', async () => {
    const manager = new WorkerManager({
      WorkerClass: MockWorker,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        workerConcurrency: 2,
      },
      logger: {},
      tracer: createTracer(),
    });

    manager.registerWorker({
      queueName: QUEUE_NAMES.EMBEDDING,
      workerName: WORKER_NAMES.EMBEDDING,
      processor: jest.fn(),
    });

    await manager.startWorker(WORKER_NAMES.EMBEDDING);
    await manager.close();

    expect(MockWorker.instances[0].run).toHaveBeenCalledTimes(1);
    expect(MockWorker.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('starts all registered workers in registration order', async () => {
    const manager = new WorkerManager({
      WorkerClass: MockWorker,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        workerConcurrency: 2,
      },
      logger: {},
      tracer: createTracer(),
    });

    manager.registerWorker({
      queueName: QUEUE_NAMES.EMBEDDING,
      workerName: WORKER_NAMES.EMBEDDING,
      processor: jest.fn(),
    });
    manager.registerWorker({
      queueName: QUEUE_NAMES.INGESTION,
      workerName: WORKER_NAMES.INGESTION,
      processor: jest.fn(),
    });

    await expect(manager.startAll()).resolves.toEqual(MockWorker.instances);

    expect(MockWorker.instances[0].run).toHaveBeenCalledTimes(1);
    expect(MockWorker.instances[1].run).toHaveBeenCalledTimes(1);
  });

  it('requires queue name, worker name, and processor', () => {
    const manager = new WorkerManager({
      WorkerClass: MockWorker,
      config: {},
      logger: {},
      tracer: createTracer(),
    });

    expect(() => manager.registerWorker({})).toThrow('queueName is required');
    expect(() => manager.registerWorker({
      queueName: QUEUE_NAMES.INGESTION,
    })).toThrow('workerName is required');
    expect(() => manager.registerWorker({
      queueName: QUEUE_NAMES.INGESTION,
      workerName: WORKER_NAMES.INGESTION,
    })).toThrow('processor must be a function');
  });

  it('traces worker processor execution', async () => {
    const tracer = createTracer();
    const processor = jest.fn().mockResolvedValue({
      status: 'completed',
    });
    const manager = new WorkerManager({
      WorkerClass: MockWorker,
      config: {
        connection: { url: 'redis://localhost:6379' },
        prefix: 'jobs:',
        workerConcurrency: 2,
      },
      logger: {},
      tracer,
    });

    manager.registerWorker({
      queueName: QUEUE_NAMES.EMBEDDING,
      workerName: WORKER_NAMES.EMBEDDING,
      processor,
    });

    await expect(MockWorker.instances[0].processor({
      id: 'job-1',
      name: 'embedding',
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
    })).resolves.toEqual({
      status: 'completed',
    });

    expect(processor).toHaveBeenCalledWith(expect.objectContaining({
      id: 'job-1',
      name: 'embedding',
    }));
    expect(tracer.traceOperation).toHaveBeenCalledWith(
      'bullmq_worker_execution',
      expect.objectContaining({
        queueName: QUEUE_NAMES.EMBEDDING,
        workerName: WORKER_NAMES.EMBEDDING,
        jobId: 'job-1',
        jobName: 'embedding',
        attempt: 2,
        configuredAttempts: 3,
      }),
      expect.any(Function),
      expect.objectContaining({
        outputMetadata: expect.any(Function),
      })
    );
  });
});
