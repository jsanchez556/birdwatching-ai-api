import { jest } from '@jest/globals';
import {
  requestFlagContext,
  requireFeatureFlag,
} from '../src/api/middleware/featureFlag.middleware.js';
import { FEATURE_FLAGS } from '../src/featureFlags/flags.js';

function request(overrides = {}) {
  return {
    user: {
      id: 'user-1',
      plan: 'PRO',
      role: 'customer',
    },
    get: jest.fn(() => 'conversation-1'),
    ...overrides,
  };
}

describe('feature flag middleware', () => {
  it('builds targeting context without PII', () => {
    expect(requestFlagContext(request())).toEqual({
      userId: 'user-1',
      anonymousId: 'conversation-1',
      personProperties: {
        plan: 'PRO',
        role: 'customer',
      },
    });
  });

  it('allows enabled features and rejects disabled features', async () => {
    const nextEnabled = jest.fn();
    const nextDisabled = jest.fn();

    await requireFeatureFlag(FEATURE_FLAGS.VOICE_AI, {
      featureFlagService: { isEnabled: jest.fn().mockResolvedValue(true) },
    })(request(), {}, nextEnabled);
    await requireFeatureFlag(FEATURE_FLAGS.VOICE_AI, {
      featureFlagService: { isEnabled: jest.fn().mockResolvedValue(false) },
    })(request(), {}, nextDisabled);

    expect(nextEnabled).toHaveBeenCalledWith();
    expect(nextDisabled).toHaveBeenCalledWith(expect.objectContaining({
      status: 403,
      code: 'FEATURE_NOT_AVAILABLE',
    }));
  });
});
