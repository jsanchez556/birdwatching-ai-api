import featureFlags from '../../featureFlags/featureFlag.service.js';
import HttpError from '../../utils/httpError.js';

function requestFlagContext(req) {
  return {
    userId: req.user?.id,
    anonymousId: req.get('x-conversation-id'),
    personProperties: {
      plan: req.user?.plan,
      role: req.user?.role || 'visitor',
    },
  };
}

function requireFeatureFlag(flag, { featureFlagService = featureFlags } = {}) {
  return async function featureFlagMiddleware(req, res, next) {
    try {
      const enabled = await featureFlagService.isEnabled({
        flag,
        ...requestFlagContext(req),
      });

      if (!enabled) {
        return next(new HttpError(403, 'This feature is not available', {
          code: 'FEATURE_NOT_AVAILABLE',
        }));
      }

      return next();
    } catch {
      return next();
    }
  };
}

export {
  requestFlagContext,
  requireFeatureFlag,
};
