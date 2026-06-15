import { jest } from '@jest/globals';
import {
  BackgroundJobTracer,
  buildQueueMetadata,
  sanitizeBackgroundJobError,
  summarizeJob,
} from '../../src/tracing/backgroundJobTracing.js';

describe('background job tracing', () => {
  it('summarizes BullMQ jobs without including payloads', () => {
    expect(summarizeJob({
      id: 'job-1',
      name: 'embedding',
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
      data: {
        text: 'hidden',
      },
    })).toEqual({
      jobId: 'job-1',
      jobName: 'embedding',
      attempt: 2,
      attemptsMade: 1,
      configuredAttempts: 3,
    });
  });

  it('builds queue metadata from safe identifiers', () => {
    expect(buildQueueMetadata({
      queueName: 'embedding',
      workerName: 'embeddingWorker',
      job: {
        id: 'job-1',
        name: 'embedding',
      },
      extra: {
        backoffType: 'exponential',
      },
    })).toEqual({
      queueName: 'embedding',
      workerName: 'embeddingWorker',
      jobType: 'embedding',
      jobId: 'job-1',
      jobName: 'embedding',
      attempt: 1,
      attemptsMade: 0,
      configuredAttempts: 0,
      backoffType: 'exponential',
    });
  });

  it('records one-shot background job events through observability', async () => {
    const trace = {
      id: 'trace-1',
      end: jest.fn(),
      error: jest.fn(),
    };
    const service = {
      startTrace: jest.fn().mockReturnValue(trace),
      createLangSmithRun: jest.fn().mockResolvedValue(undefined),
      completeLangSmithRun: jest.fn().mockResolvedValue(undefined),
    };
    const tracer = new BackgroundJobTracer({ service });

    await tracer.recordEvent('bullmq_queue_registered', {
      queueName: 'embedding',
    }, {
      status: 'registered',
    });

    expect(service.startTrace).toHaveBeenCalledWith({
      type: 'background_job',
      name: 'bullmq_queue_registered',
      metadata: {
        queueName: 'embedding',
      },
      parentTraceId: undefined,
    });
    expect(trace.end).toHaveBeenCalledWith({
      status: 'registered',
    });
    expect(service.completeLangSmithRun).toHaveBeenCalledWith(trace, {
      status: 'registered',
    });
  });

  it('traces operations with sanitized failure metadata while rethrowing original errors', async () => {
    const trace = {
      id: 'trace-1',
      end: jest.fn(),
      error: jest.fn(),
    };
    const service = {
      startTrace: jest.fn().mockReturnValue(trace),
      createLangSmithRun: jest.fn().mockResolvedValue(undefined),
      completeLangSmithRun: jest.fn().mockResolvedValue(undefined),
      failLangSmithRun: jest.fn().mockResolvedValue(undefined),
    };
    const tracer = new BackgroundJobTracer({ service });
    const originalError = new Error('provider leaked raw detail');

    await expect(tracer.traceOperation('bullmq_worker_execution', {
      queueName: 'embedding',
    }, async () => {
      throw originalError;
    })).rejects.toBe(originalError);

    expect(service.failLangSmithRun).toHaveBeenCalledWith(trace, expect.objectContaining({
      name: 'Error',
      message: 'Background job failed',
    }));
    expect(trace.error).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Background job failed',
    }));
  });

  it('keeps non-retryable validation failure messages visible', () => {
    const error = sanitizeBackgroundJobError({
      name: 'UnrecoverableError',
      message: 'Embedding job payload is invalid',
    });

    expect(error).toMatchObject({
      name: 'UnrecoverableError',
      message: 'Embedding job payload is invalid',
    });
  });
});
