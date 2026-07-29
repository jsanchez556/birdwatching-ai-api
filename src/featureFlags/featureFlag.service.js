import env from '../config/env.js';
import logger from '../utils/logger.js';
import { createPostHogProvider } from '../analytics/posthog.adapter.js';
import { FEATURE_FLAG_DEFAULTS } from './flags.js';
import featureControlQueries from '../db/queries/featureControl.queries.js';

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
    controlRepository = null,
    clock = () => new Date(),
  } = {}) {
    this.provider = provider;
    this.defaults = defaults;
    this.logger = featureFlagLogger;
    this.controlRepository = controlRepository;
    this.clock = clock;
    this.disabledUntilByFlag = new Map();
  }

  rememberDisabled(flag, disabledUntil) {
    const timestamp = new Date(disabledUntil).getTime();
    if (Object.hasOwn(this.defaults, flag) && Number.isFinite(timestamp)) {
      this.disabledUntilByFlag.set(flag, timestamp);
    }
  }

  rememberEnabled(flag) {
    this.disabledUntilByFlag.delete(flag);
  }

  isRememberedDisabled(flag) {
    const disabledUntil = this.disabledUntilByFlag.get(flag);
    if (!disabledUntil) return false;
    if (disabledUntil <= this.clock().getTime()) {
      this.disabledUntilByFlag.delete(flag);
      return false;
    }
    return true;
  }

  async isTemporarilyDisabled(flag) {
    return Boolean(await this.getTemporaryDisable(flag));
  }

  async getTemporaryDisable(flag) {
    const rememberedUntil = this.disabledUntilByFlag.get(flag);
    if (this.isRememberedDisabled(flag)) {
      return {
        feature: flag,
        disabledUntil: new Date(rememberedUntil).toISOString(),
      };
    }
    if (!this.controlRepository) return false;

    try {
      const control = await this.controlRepository.getActiveDisable({ feature: flag });
      if (control?.disabled_until) {
        this.rememberDisabled(flag, control.disabled_until);
        return {
          feature: flag,
          disabledUntil: new Date(control.disabled_until).toISOString(),
        };
      }
      this.disabledUntilByFlag.delete(flag);
      return null;
    } catch {
      this.logger.warn('AI feature control lookup failed', { flag });
      return {
        feature: flag,
        disabledUntil: null,
        unavailable: true,
      };
    }
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

    if (await this.isTemporarilyDisabled(flag)) {
      return false;
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
  controlRepository: env.nodeEnv === 'test' ? null : featureControlQueries,
});

export {
  FeatureFlagService,
  compactPersonProperties,
};
export default featureFlags;
