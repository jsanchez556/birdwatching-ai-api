import {
  createNonRetryableJobError,
  isFinalJobAttempt,
} from '../../src/jobs/jobErrors.js';

describe('job errors', () => {
  it('creates BullMQ unrecoverable errors for non-retryable job failures', () => {
    const error = createNonRetryableJobError('Invalid payload');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UnrecoverableError');
    expect(error.message).toBe('Invalid payload');
  });

  it('detects final retry attempts', () => {
    expect(isFinalJobAttempt({
      attemptsMade: 2,
      opts: {
        attempts: 3,
      },
    })).toBe(true);

    expect(isFinalJobAttempt({
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
    })).toBe(false);

    expect(isFinalJobAttempt({}, createNonRetryableJobError('Invalid'))).toBe(true);
  });
});
