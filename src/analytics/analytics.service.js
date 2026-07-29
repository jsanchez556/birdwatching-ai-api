import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { createPostHogProvider } from './posthog.adapter.js';

const BLOCKED_PROPERTY_PATTERN = /(authorization|customer|email|message|name|password|prompt|provider.*id|response|secret|session.*id|token)/i;
const SERVICE_NAME = 'birdwatching-ai-api';

function compactSafeProperties(properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => (
    !BLOCKED_PROPERTY_PATTERN.test(key)
    && value !== undefined
    && value !== null
    && ['string', 'number', 'boolean'].includes(typeof value)
  )));
}

function deterministicEventId(event, idempotencyKey) {
  if (!idempotencyKey) {
    return undefined;
  }

  return crypto
    .createHash('sha256')
    .update(`${event}:${idempotencyKey}`)
    .digest('hex');
}

class AnalyticsService {
  constructor({
    provider = null,
    environment = env.nodeEnv,
    service = SERVICE_NAME,
    analyticsLogger = logger,
  } = {}) {
    this.provider = provider;
    this.environment = environment;
    this.service = service;
    this.logger = analyticsLogger;
  }

  track({ userId, anonymousId, event, properties = {}, idempotencyKey } = {}) {
    const distinctId = userId ?? anonymousId;

    if (!this.provider || distinctId === undefined || distinctId === null) {
      return false;
    }

    if (typeof event !== 'string' || !event.trim()) {
      return false;
    }

    const insertId = deterministicEventId(event, idempotencyKey);

    try {
      this.provider.capture({
        distinctId: String(distinctId),
        event: event.trim(),
        properties: {
          environment: this.environment,
          service: this.service,
          ...(userId === undefined || userId === null ? {} : { userId: String(userId) }),
          ...compactSafeProperties(properties),
          ...(insertId ? { $insert_id: insertId } : {}),
        },
      });
      return true;
    } catch {
      this.logger.warn('Analytics event delivery failed', {
        event: event.trim(),
      });
      return false;
    }
  }

  async shutdown() {
    if (!this.provider?.shutdown) {
      return;
    }

    try {
      await this.provider.shutdown();
    } catch {
      this.logger.warn('Analytics shutdown failed');
    }
  }
}

function createConfiguredProvider() {
  try {
    return createPostHogProvider(env.posthog);
  } catch {
    logger.warn('Analytics provider initialization failed');
    return null;
  }
}

const analytics = new AnalyticsService({
  provider: createConfiguredProvider(),
});

export {
  AnalyticsService,
  compactSafeProperties,
  deterministicEventId,
};
export default analytics;
