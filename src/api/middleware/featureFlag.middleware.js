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
      const temporaryDisable = await featureFlagService.getTemporaryDisable?.(flag);
      if (temporaryDisable) {
        if (temporaryDisable.unavailable) {
          return next(new HttpError(503, 'This feature is temporarily unavailable.', {
            code: 'FEATURE_CONTROL_UNAVAILABLE',
            expose: true,
          }));
        }
        const message = {
          voice_ai: 'Voice messages are temporarily unavailable.',
          multimodal_bird_identification: 'Bird identification is temporarily unavailable.',
          agent_booking: 'AI-assisted booking is temporarily unavailable.',
        }[flag] || 'This feature is temporarily unavailable.';
        return next(new HttpError(503, message, {
          code: 'FEATURE_TEMPORARILY_DISABLED',
          expose: true,
          meta: {
            feature: flag,
            disabledUntil: temporaryDisable.disabledUntil,
          },
        }));
      }

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
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      return next(new HttpError(503, 'This feature is temporarily unavailable.', {
        code: 'FEATURE_CONTROL_UNAVAILABLE',
        expose: true,
      }));
    }
  };
}

export {
  requestFlagContext,
  requireFeatureFlag,
};
