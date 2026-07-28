import express from 'express';
import featureAvailabilityController from '../controllers/featureAvailability.controller.js';
import { asyncHandler } from '../../utils/async.utils.js';

const router = express.Router();

router.get(
  '/availability',
  asyncHandler(featureAvailabilityController.getAvailability.bind(featureAvailabilityController))
);

export default router;
