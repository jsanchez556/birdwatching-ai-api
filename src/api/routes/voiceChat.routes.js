import express from 'express';
import voiceChatController from '../controllers/voiceChat.controller.js';
import audioUpload from '../middleware/audioUpload.middleware.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { aiRateLimit, visitorAiRateLimit } from '../middleware/rateLimit.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import HttpError from '../../utils/httpError.js';
import { validateAudioUpload } from '../validators/audio.validator.js';
import { validateChatQuota } from '../validators/usage.validator.js';
import { validateVoiceChatContext } from '../validators/voiceChat.validator.js';
import { requireFeatureFlag } from '../middleware/featureFlag.middleware.js';
import { FEATURE_FLAGS } from '../../featureFlags/flags.js';
import { assignAiTrace } from '../middleware/aiTrace.middleware.js';

const router = express.Router();
const roleAwareAiRateLimit = (req, res, next) => (
  req.user ? aiRateLimit(req, res, next) : visitorAiRateLimit(req, res, next)
);

function validateVoiceChatRequest(req, res, next) {
  const audioResult = validateAudioUpload(req);
  const contextResult = validateVoiceChatContext(req);
  const errors = [...audioResult.errors, ...contextResult.errors];

  if (errors.length > 0) {
    return next(new HttpError(422, 'Invalid voice chat request', {
      code: 'validation_error',
      details: errors,
    }));
  }

  req.audioUpload = audioResult.value.audioUpload;
  req.voiceChatContext = contextResult.value;

  return next();
}

router.post(
  '/',
  optionalAuth,
  requireFeatureFlag(FEATURE_FLAGS.VOICE_AI),
  roleAwareAiRateLimit,
  audioUpload,
  validateVoiceChatRequest,
  validateChatQuota,
  assignAiTrace,
  asyncHandler(voiceChatController.handleVoiceChat.bind(voiceChatController))
);

export default router;
