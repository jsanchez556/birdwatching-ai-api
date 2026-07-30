const wait = (delayMs) => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

async function asyncRetry(operation, options = {}) {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? Number.POSITIVE_INFINITY;
  const jitterRatio = options.jitterRatio ?? 0;
  const random = options.random || Math.random;
  const shouldRetry = options.shouldRetry || (() => true);
  const onRetry = options.onRetry || (() => {});
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error)) {
        break;
      }

      const exponentialDelayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitterWindowMs = exponentialDelayMs * Math.max(0, jitterRatio);
      const delayMs = Math.max(
        0,
        Math.round(exponentialDelayMs - jitterWindowMs + (2 * jitterWindowMs * random()))
      );

      await onRetry({
        error,
        attempt: attempt + 1,
        delayMs,
        retries,
      });
      await wait(delayMs);
    }
  }

  throw lastError;
}

function asyncHandler(fn) {
  return async function (req, res, next) {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export {
  asyncHandler,
  asyncRetry,
};
