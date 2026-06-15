import {
  JOB_TYPES,
  QUEUE_NAMES,
  WORKER_NAMES,
  getQueueNameForJobType,
  isKnownJobType,
} from '../../src/jobs/jobTypes.js';
import {
  DEFAULT_JOB_OPTIONS,
  buildJobOptions,
} from '../../src/jobs/jobOptions.js';

describe('job types', () => {
  it('defines stable queue and worker names for AI platform jobs', () => {
    expect(JOB_TYPES).toEqual({
      BIRD_IDENTIFICATION: 'bird-identification',
      EMBEDDING: 'embedding',
      INGESTION: 'ingestion',
    });
    expect(QUEUE_NAMES).toEqual({
      BIRD_IDENTIFICATION: 'bird-identification',
      DEAD_LETTER: 'dead-letter',
      EMBEDDING: 'embedding',
      INGESTION: 'ingestion',
    });
    expect(WORKER_NAMES).toEqual({
      BIRD_IDENTIFICATION: 'birdIdentificationWorker',
      EMBEDDING: 'embeddingWorker',
      INGESTION: 'ingestionWorker',
    });
  });

  it('maps known job types to queues', () => {
    expect(isKnownJobType(JOB_TYPES.BIRD_IDENTIFICATION)).toBe(true);
    expect(isKnownJobType('unknown')).toBe(false);
    expect(getQueueNameForJobType(JOB_TYPES.EMBEDDING)).toBe(QUEUE_NAMES.EMBEDDING);
  });
});

describe('job options', () => {
  it('builds default BullMQ job options with targeted overrides', () => {
    expect(buildJobOptions({
      attempts: 5,
      backoff: {
        delay: 250,
      },
    })).toEqual({
      ...DEFAULT_JOB_OPTIONS,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 250,
      },
    });
  });
});
