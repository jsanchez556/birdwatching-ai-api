import { UnrecoverableError } from 'bullmq';

function createNonRetryableJobError(message) {
  return new UnrecoverableError(message);
}

function isFinalJobAttempt(job = {}, error) {
  if (error?.name === 'UnrecoverableError') {
    return true;
  }

  const configuredAttempts = Number(job?.opts?.attempts || 1);
  const attemptsMade = Number(job?.attemptsMade || 0);

  return configuredAttempts <= 1 || attemptsMade + 1 >= configuredAttempts;
}

export {
  createNonRetryableJobError,
  isFinalJobAttempt,
};
