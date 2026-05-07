import express from 'express';
import recommendationController from '../controllers/recommendation.controller.js';
import validate from '../middleware/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { validateRecommendationBody } from '../validators/chat.validator.js';

const router = express.Router();

router.post(
  '/',
  validate(validateRecommendationBody),
  asyncHandler(recommendationController.handleRecommendation.bind(recommendationController))
);

export default router;
