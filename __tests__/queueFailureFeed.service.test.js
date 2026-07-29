import { jest } from '@jest/globals';
import {
  DEAD_LETTER_STATES,
  QueueFailureFeedService,
} from '../src/services/queueFailureFeed.service.js';

describe('QueueFailureFeedService', () => {
  it('reads bounded dead-letter jobs and exposes no payload or raw error', async () => {
    const getJobs = jest.fn().mockResolvedValue([{
      id: 'dlq-id',
      data: {
        originalQueueName: 'embedding',
        jobId: 'job-42',
        failedAt: '2026-07-28T12:00:00.000Z',
        metadata: {
          userId: '7',
          aiTraceId: 'trace-7',
        },
        error: {
          message: 'provider secret',
          stack: 'must-not-leak',
        },
        sourcePayload: 'must-not-leak',
      },
    }]);
    const service = new QueueFailureFeedService({
      manager: {
        config: { deadLetter: { queueName: 'dead-letter' } },
        getQueue: jest.fn().mockReturnValue({ getJobs }),
      },
    });

    const result = await service.getRecentFailures({
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
      limit: 25,
    });

    expect(getJobs).toHaveBeenCalledWith(DEAD_LETTER_STATES, 0, 24, false);
    expect(result).toEqual([{
      id: 'dlq-embedding-job-42',
      timestamp: '2026-07-28T12:00:00.000Z',
      type: 'QUEUE_FAILURE',
      userId: '7',
      traceId: 'trace-7',
      dedupeKey: 'queue:job-42',
    }]);
    expect(JSON.stringify(result)).not.toContain('provider secret');
    expect(JSON.stringify(result)).not.toContain('sourcePayload');
  });
});
