import { PostHog } from 'posthog-node';

class PostHogProvider {
  constructor({ apiKey, host }) {
    this.client = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  capture({ distinctId, event, properties }) {
    this.client.capture({
      distinctId,
      event,
      properties,
    });
  }

  async shutdown() {
    await this.client._shutdown();
  }
}

export { PostHogProvider };

export function createPostHogProvider(config = {}) {
  if (!config.enabled || !config.apiKey) {
    return null;
  }

  return new PostHogProvider(config);
}
