const wait = (delayMs) => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

async function asyncRetry(operation, options = {}) {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const shouldRetry = options.shouldRetry || (() => true);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error)) {
        break;
      }

      await wait(baseDelayMs * 2 ** attempt);
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
