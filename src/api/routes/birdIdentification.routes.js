import express from 'express';
import birdIdentificationController from '../controllers/birdIdentification.controller.js';
import imageUpload from '../middleware/imageUpload.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { aiRateLimit } from '../middleware/rateLimit.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import HttpError from '../../utils/httpError.js';
import { validateBirdIdentificationBody } from '../validators/birdIdentification.validator.js';
import { validateIdentificationQuota } from '../validators/usage.validator.js';
import { requireFeatureFlag } from '../middleware/featureFlag.middleware.js';
import { FEATURE_FLAGS } from '../../featureFlags/flags.js';

const router = express.Router();

function validateBirdIdentificationRequest(req, res, next) {
  const result = validateBirdIdentificationBody(req);

  if (result.errors.length > 0) {
    return next(new HttpError(422, result.message, {
      code: 'validation_error',
      details: result.errors,
    }));
  }

  req.body = {
    ...req.body,
    ...result.value,
  };
  req.imageUpload = result.value.imageUpload;

  return next();
}

router.post(
  '/birds/identify',
  requireAuth,
  requireFeatureFlag(FEATURE_FLAGS.MULTIMODAL_BIRD_IDENTIFICATION),
  aiRateLimit,
  imageUpload,
  validateBirdIdentificationRequest,
  validateIdentificationQuota,
  asyncHandler(birdIdentificationController.handleIdentifyBird.bind(birdIdentificationController))
);

router.post(
  '/bird-identification',
  requireAuth,
  requireFeatureFlag(FEATURE_FLAGS.MULTIMODAL_BIRD_IDENTIFICATION),
  aiRateLimit,
  imageUpload,
  validateBirdIdentificationRequest,
  validateIdentificationQuota,
  asyncHandler(birdIdentificationController.handleIdentifyBird.bind(birdIdentificationController))
);

export default router;
