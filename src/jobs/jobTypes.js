const JOB_TYPES = Object.freeze({
  BIRD_IDENTIFICATION: 'bird-identification',
  EMBEDDING: 'embedding',
  INGESTION: 'ingestion',
});

const QUEUE_NAMES = Object.freeze({
  BIRD_IDENTIFICATION: 'bird-identification',
  DEAD_LETTER: 'dead-letter',
  EMBEDDING: 'embedding',
  INGESTION: 'ingestion',
});

const WORKER_NAMES = Object.freeze({
  BIRD_IDENTIFICATION: 'birdIdentificationWorker',
  EMBEDDING: 'embeddingWorker',
  INGESTION: 'ingestionWorker',
});

const JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  NOT_FOUND: 'not_found',
});

const QUEUE_BY_JOB_TYPE = Object.freeze({
  [JOB_TYPES.BIRD_IDENTIFICATION]: QUEUE_NAMES.BIRD_IDENTIFICATION,
  [JOB_TYPES.EMBEDDING]: QUEUE_NAMES.EMBEDDING,
  [JOB_TYPES.INGESTION]: QUEUE_NAMES.INGESTION,
});

const JOB_TYPE_VALUES = Object.freeze(Object.values(JOB_TYPES));
const QUEUE_NAME_VALUES = Object.freeze(Object.values(QUEUE_NAMES));

const isKnownJobType = (jobType) => JOB_TYPE_VALUES.includes(jobType);

const getQueueNameForJobType = (jobType) => QUEUE_BY_JOB_TYPE[jobType];

export {
  JOB_TYPES,
  JOB_STATUSES,
  JOB_TYPE_VALUES,
  QUEUE_BY_JOB_TYPE,
  QUEUE_NAMES,
  QUEUE_NAME_VALUES,
  WORKER_NAMES,
  getQueueNameForJobType,
  isKnownJobType,
};
