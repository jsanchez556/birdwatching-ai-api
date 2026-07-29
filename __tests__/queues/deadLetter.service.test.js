import {
  buildDeadLetterPayload,
  sanitizeError,
  sanitizeMetadata,
} from '../../src/queues/deadLetter.service.js';

describe('dead-letter service helpers', () => {
  it('sanitizes sensitive metadata fields', () => {
    expect(sanitizeMetadata({
      documentId: 7,
      imageUrl: 'https://example.test/private.jpg',
      prompt: 'hidden prompt',
      traceId: 'trace-1',
      nested: { no: 'objects' },
    })).toEqual({
      documentId: '7',
      traceId: 'trace-1',
    });
  });

  it('builds safe dead-letter payloads', () => {
    expect(buildDeadLetterPayload({
      queueName: 'embedding',
      job: {
        id: 'job-1',
        name: 'embedding',
        attemptsMade: 3,
        opts: {
          attempts: 3,
        },
        data: {
          documentId: 7,
          text: 'do not include',
        },
      },
      error: {
        name: 'TimeoutError',
        code: 'ETIMEDOUT',
        message: 'provider timeout',
      },
      failedAt: new Date('2026-06-16T12:00:00.000Z'),
    })).toEqual({
      originalQueueName: 'embedding',
      jobName: 'embedding',
      jobId: 'job-1',
      attemptsMade: 3,
      configuredAttempts: 3,
      error: {
        name: 'TimeoutError',
        code: 'ETIMEDOUT',
        message: 'provider timeout',
      },
      failedAt: '2026-06-16T12:00:00.000Z',
      metadata: {
        documentId: '7',
      },
    });
  });

  it('normalizes empty errors', () => {
    expect(sanitizeError()).toEqual({
      name: 'Error',
      code: undefined,
      message: 'Background job failed',
    });
  });
});
