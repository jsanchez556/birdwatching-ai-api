import { jest } from '@jest/globals';
import { QUEUE_NAMES } from '../src/jobs/jobTypes.js';
import {
  QUEUE_COUNT_TYPES,
  QueueHealthService,
} from '../src/services/queueHealth.service.js';

function buildQueue(counts) {
  return {
    getJobCounts: jest.fn().mockResolvedValue(counts),
  };
}

describe('QueueHealthService', () => {
  it('returns all five BullMQ counts for the three product queues', async () => {
    const queuesByName = {
      [QUEUE_NAMES.BIRD_IDENTIFICATION]: buildQueue({
        waiting: 4,
        active: 2,
        completed: 120,
        failed: 0,
        delayed: 1,
      }),
      [QUEUE_NAMES.EMBEDDING]: buildQueue({
        waiting: 0,
        active: 1,
        completed: 86,
        failed: 2,
        delayed: 0,
      }),
      [QUEUE_NAMES.INGESTION]: buildQueue({
        waiting: 3,
        active: 0,
        completed: 42,
        failed: 1,
        delayed: 0,
      }),
    };
    const manager = {
      getQueue: jest.fn((name) => queuesByName[name]),
    };
    const service = new QueueHealthService({ queues: manager });

    await expect(service.getStatistics()).resolves.toEqual({
      queues: [
        {
          id: 'bird-identification',
          name: 'Bird Identification',
          waiting: 4,
          active: 2,
          completed: 120,
          failed: 0,
          delayed: 1,
        },
        {
          id: 'embeddings',
          name: 'Embeddings',
          waiting: 0,
          active: 1,
          completed: 86,
          failed: 2,
          delayed: 0,
        },
        {
          id: 'document-ingestion',
          name: 'Document Ingestion',
          waiting: 3,
          active: 0,
          completed: 42,
          failed: 1,
          delayed: 0,
        },
      ],
    });
    expect(manager.getQueue.mock.calls.map(([name]) => name)).toEqual([
      QUEUE_NAMES.BIRD_IDENTIFICATION,
      QUEUE_NAMES.EMBEDDING,
      QUEUE_NAMES.INGESTION,
    ]);
    Object.values(queuesByName).forEach((queue) => {
      expect(queue.getJobCounts).toHaveBeenCalledWith(...QUEUE_COUNT_TYPES);
    });
  });

  it('rejects when BullMQ cannot read a queue', async () => {
    const redisError = new Error('redis://credential@host must not leak');
    const manager = {
      getQueue: jest.fn((name) => ({
        getJobCounts: name === QUEUE_NAMES.EMBEDDING
          ? jest.fn().mockRejectedValue(redisError)
          : jest.fn().mockResolvedValue({}),
      })),
    };
    const service = new QueueHealthService({ queues: manager });

    await expect(service.getStatistics()).rejects.toBe(redisError);
  });
});
