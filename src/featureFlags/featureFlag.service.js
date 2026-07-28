import env from '../config/env.js';
import logger from '../utils/logger.js';
import { createPostHogProvider } from '../analytics/posthog.provider.js';
import { FEATURE_FLAG_DEFAULTS } from './flags.js';

const BLOCKED_PERSON_PROPERTY_PATTERN = /(authorization|customer|email|message|name|password|prompt|response|secret|session.*id|token)/i;

function compactPersonProperties(properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  return Object.fromEntries(Object.entries(properties).filter(([, value]) => (
    value !== undefined
    && value !== null
    && ['string', 'number', 'boolean'].includes(typeof value)
  )).filter(([key]) => !BLOCKED_PERSON_PROPERTY_PATTERN.test(key)));
}

class FeatureFlagService {
  constructor({
    provider = null,
    defaults = FEATURE_FLAG_DEFAULTS,
    featureFlagLogger = logger,
  } = {}) {
    this.provider = provider;
    this.defaults = defaults;
    this.logger = featureFlagLogger;
  }

  async getValue({
    flag,
    userId,
    anonymousId,
    personProperties = {},
    defaultValue,
  } = {}) {
    if (typeof flag !== 'string' || !Object.hasOwn(this.defaults, flag)) {
      return defaultValue;
    }

    const fallback = defaultValue ?? this.defaults[flag];
    const distinctId = userId ?? anonymousId;

    if (!this.provider || distinctId === undefined || distinctId === null) {
      return fallback;
    }

    try {
      const value = await this.provider.getFeatureFlag({
        distinctId: String(distinctId),
        flag,
        personProperties: compactPersonProperties(personProperties),
      });

      return value === undefined || value === null ? fallback : value;
    } catch {
      this.logger.warn('Feature flag evaluation failed', { flag });
      return fallback;
    }
  }

  async isEnabled(options = {}) {
    const value = await this.getValue(options);
    return value === true || (typeof value === 'string' && value !== 'false');
  }

  async getVariant(options = {}) {
    const value = await this.getValue(options);
    return typeof value === 'string' ? value : options.defaultValue;
  }

  async shutdown() {
    try {
      await this.provider?.shutdown?.();
    } catch {
      this.logger.warn('Feature flag provider shutdown failed');
    }
  }
}

function createConfiguredProvider() {
  try {
    return createPostHogProvider(env.posthog);
  } catch {
    logger.warn('Feature flag provider initialization failed');
    return null;
  }
}

const featureFlags = new FeatureFlagService({
  provider: createConfiguredProvider(),
});

export {
  FeatureFlagService,
  compactPersonProperties,
};
export default featureFlags;
