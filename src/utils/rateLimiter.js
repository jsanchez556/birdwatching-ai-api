import HttpError from './httpError.js';

const defaultSleep = (delayMs) => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

class ApiRateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests ?? 40;
    this.windowMs = options.windowMs ?? 60 * 1000;
    this.now = options.now || (() => Date.now());
    this.sleep = options.sleep || defaultSleep;
    this.nextAvailableAt = this.now();
    this.queue = Promise.resolve();

    if (this.maxRequests > 40) {
      throw new HttpError(500, 'External API rate limit cannot exceed 40 requests per minute', {
        code: 'EXTERNAL_API_RATE_LIMIT_CONFIG_ERROR',
      });
    }
  }

  async acquire() {
    const scheduled = this.queue.then(() => this.acquireSlot());
    this.queue = scheduled.catch(() => {});

    return scheduled;
  }

  async acquireSlot() {
    const now = this.now();
    const waitMs = Math.max(this.nextAvailableAt - now, 0);

    if (waitMs > 0) {
      try {
        await this.sleep(waitMs);
      } catch (error) {
        throw new HttpError(429, 'External API rate limit wait failed', {
          code: 'EXTERNAL_API_RATE_LIMIT_ERROR',
          details: {
            reason: error.message,
          },
        });
      }
    }

    const acquiredAt = this.now();
    this.nextAvailableAt = Math.max(
      this.nextAvailableAt,
      acquiredAt
    ) + (this.windowMs / this.maxRequests);
  }
}

export default ApiRateLimiter;
