import { jest } from '@jest/globals';
import { attachQueueEvents, attachWorkerEvents } from '../../src/events/queue.events.js';

const getHandler = (emitter, eventName) => emitter.on.mock.calls
  .find(([registeredEvent]) => registeredEvent === eventName)[1];

describe('queue events', () => {
  it('attaches no-op safely when queue events are missing', () => {
    expect(attachQueueEvents()).toBeUndefined();
    expect(attachQueueEvents({ queueEvents: {} })).toEqual({});
  });

  it('traces retry scheduling without dead-letter handoff before attempts are exhausted', async () => {
    const queueEvents = {
      on: jest.fn(),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        id: 'job-1',
        name: 'embedding',
        attemptsMade: 1,
        opts: {
          attempts: 3,
        },
      }),
    };
    const deadLetterService = {
      enqueueFromFailure: jest.fn(),
    };
    const tracer = {
      recordEvent: jest.fn(),
    };

    attachQueueEvents({
      config: {
        deadLetter: {
          enabled: true,
        },
      },
      deadLetterService,
      queue,
      queueEvents,
      queueName: 'embedding',
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer,
    });

    await getHandler(queueEvents, 'failed')({
      jobId: 'job-1',
      failedReason: 'provider timeout',
      prev: 'active',
    });

    expect(deadLetterService.enqueueFromFailure).not.toHaveBeenCalled();
    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_job_failure',
      expect.objectContaining({
        queueName: 'embedding',
        jobId: 'job-1',
        attemptsMade: 1,
        configuredAttempts: 3,
      }),
      {
        status: 'failed_retrying',
        errorName: 'JobFailed',
      }
    );
    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_job_retry_scheduled',
      expect.objectContaining({
        nextAttempt: 2,
      }),
      {
        status: 'retry_scheduled',
      }
    );
  });

  it('traces exhausted failures even when DLQ is disabled', async () => {
    const queueEvents = {
      on: jest.fn(),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        id: 'job-1',
        name: 'ingestion',
        attemptsMade: 3,
        opts: {
          attempts: 3,
        },
      }),
    };
    const deadLetterService = {
      enqueueFromFailure: jest.fn(),
    };
    const tracer = {
      recordEvent: jest.fn(),
    };

    attachQueueEvents({
      config: {
        deadLetter: {
          enabled: false,
        },
      },
      deadLetterService,
      queue,
      queueEvents,
      queueName: 'ingestion',
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer,
    });

    await getHandler(queueEvents, 'failed')({
      jobId: 'job-1',
      failedReason: 'exhausted',
    });

    expect(deadLetterService.enqueueFromFailure).not.toHaveBeenCalled();
    expect(tracer.recordEvent).toHaveBeenCalledWith(
      'bullmq_job_failure',
      expect.objectContaining({
        attemptsMade: 3,
        configuredAttempts: 3,
      }),
      {
        status: 'failed_exhausted',
        errorName: 'JobFailed',
      }
    );
    expect(tracer.recordEvent).not.toHaveBeenCalledWith(
      'bullmq_job_dead_lettered',
      expect.anything(),
      expect.anything()
    );
  });

  it('traces worker retry and final failure lifecycle events', () => {
    const worker = {
      on: jest.fn(),
    };
    const tracer = {
      recordEvent: jest.fn(),
    };

    attachWorkerEvents({
      worker,
      queueName: 'bird-identification',
      workerName: 'birdIdentificationWorker',
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      tracer,
    });

    const failedHandler = getHandler(worker, 'failed');

    failedHandler({
      id: 'job-1',
      name: 'bird-identification',
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
    }, Object.assign(new Error('provider unavailable'), { code: 'ETIMEDOUT' }));

    failedHandler({
      id: 'job-2',
      name: 'bird-identification',
      attemptsMade: 3,
      opts: {
        attempts: 3,
      },
    }, new Error('provider unavailable'));

    expect(tracer.recordEvent).toHaveBeenNthCalledWith(
      1,
      'bullmq_worker_failure',
      expect.objectContaining({
        jobId: 'job-1',
        attemptsMade: 1,
        configuredAttempts: 3,
      }),
      expect.objectContaining({
        status: 'retry_scheduled',
        errorCode: 'ETIMEDOUT',
      })
    );
    expect(tracer.recordEvent).toHaveBeenNthCalledWith(
      2,
      'bullmq_worker_failure',
      expect.objectContaining({
        jobId: 'job-2',
        attemptsMade: 3,
        configuredAttempts: 3,
      }),
      expect.objectContaining({
        status: 'failed',
      })
    );
  });
});
