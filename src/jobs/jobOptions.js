const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5_000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 1_000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 5_000,
  },
});

const buildJobOptions = (overrides = {}) => ({
  ...DEFAULT_JOB_OPTIONS,
  ...overrides,
  backoff: {
    ...DEFAULT_JOB_OPTIONS.backoff,
    ...(overrides.backoff || {}),
  },
  removeOnComplete: overrides.removeOnComplete ?? DEFAULT_JOB_OPTIONS.removeOnComplete,
  removeOnFail: overrides.removeOnFail ?? DEFAULT_JOB_OPTIONS.removeOnFail,
});

export {
  DEFAULT_JOB_OPTIONS,
  buildJobOptions,
};
