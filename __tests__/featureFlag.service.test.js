import { jest } from '@jest/globals';
import { FeatureFlagService } from '../src/featureFlags/featureFlag.service.js';
import {
  FEATURE_FLAGS,
  RETRIEVAL_VARIANTS,
} from '../src/featureFlags/flags.js';

describe('FeatureFlagService', () => {
  it('maps stable identities and safe targeting properties to the provider', async () => {
    const provider = {
      getFeatureFlag: jest.fn().mockResolvedValue(RETRIEVAL_VARIANTS.NEW),
    };
    const service = new FeatureFlagService({ provider });

    await expect(service.getVariant({
      flag: FEATURE_FLAGS.ADVANCED_RAG,
      userId: 42,
      personProperties: {
        plan: 'PRO',
        role: 'customer',
        email: 'private@example.test',
        nested: { private: true },
      },
      defaultValue: RETRIEVAL_VARIANTS.CURRENT,
    })).resolves.toBe(RETRIEVAL_VARIANTS.NEW);

    expect(provider.getFeatureFlag).toHaveBeenCalledWith({
      distinctId: '42',
      flag: FEATURE_FLAGS.ADVANCED_RAG,
      personProperties: {
        plan: 'PRO',
        role: 'customer',
      },
    });
  });

  it('uses current behavior when disabled or when evaluation fails', async () => {
    const featureFlagLogger = { warn: jest.fn() };
    const failingService = new FeatureFlagService({
      provider: {
        getFeatureFlag: jest.fn().mockRejectedValue(new Error('provider failure')),
      },
      featureFlagLogger,
    });
    const disabledService = new FeatureFlagService({ provider: null });

    await expect(disabledService.isEnabled({
      flag: FEATURE_FLAGS.VOICE_AI,
      userId: 42,
    })).resolves.toBe(true);
    await expect(failingService.getVariant({
      flag: FEATURE_FLAGS.ADVANCED_RAG,
      userId: 42,
      defaultValue: RETRIEVAL_VARIANTS.CURRENT,
    })).resolves.toBe(RETRIEVAL_VARIANTS.CURRENT);
    expect(featureFlagLogger.warn).toHaveBeenCalledWith(
      'Feature flag evaluation failed',
      { flag: FEATURE_FLAGS.ADVANCED_RAG }
    );
  });

  it('shuts down the provider without propagating failures', async () => {
    const featureFlagLogger = { warn: jest.fn() };
    const service = new FeatureFlagService({
      provider: {
        shutdown: jest.fn().mockRejectedValue(new Error('shutdown failure')),
      },
      featureFlagLogger,
    });

    await expect(service.shutdown()).resolves.toBeUndefined();
    expect(featureFlagLogger.warn).toHaveBeenCalledWith(
      'Feature flag provider shutdown failed'
    );
  });

  it('evaluates boolean and multivariate flags for the same stable identity', async () => {
    const provider = {
      getFeatureFlag: jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(RETRIEVAL_VARIANTS.NEW),
    };
    const service = new FeatureFlagService({ provider });
    const identity = {
      userId: 42,
      personProperties: {
        plan: 'PRO',
      },
    };

    await expect(service.isEnabled({
      ...identity,
      flag: FEATURE_FLAGS.VOICE_AI,
    })).resolves.toBe(true);
    await expect(service.getVariant({
      ...identity,
      flag: FEATURE_FLAGS.ADVANCED_RAG,
      defaultValue: RETRIEVAL_VARIANTS.CURRENT,
    })).resolves.toBe(RETRIEVAL_VARIANTS.NEW);

    expect(provider.getFeatureFlag).toHaveBeenNthCalledWith(1, {
      distinctId: '42',
      flag: FEATURE_FLAGS.VOICE_AI,
      personProperties: {
        plan: 'PRO',
      },
    });
    expect(provider.getFeatureFlag).toHaveBeenNthCalledWith(2, {
      distinctId: '42',
      flag: FEATURE_FLAGS.ADVANCED_RAG,
      personProperties: {
        plan: 'PRO',
      },
    });
  });
});
