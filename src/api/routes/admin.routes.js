import express from 'express';
import adminController from '../controllers/admin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import validate from '../middleware/validate.middleware.js';
import {
  validateDisableAiFeature,
  validateEnableAiFeature,
  validateRetryJob,
  validateSuspendUser,
  validateUnsuspendUser,
} from '../validators/adminOperations.validator.js';
import { validateModelRoutingPreview } from '../validators/modelRouting.validator.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', asyncHandler(adminController.getOverview.bind(adminController)));
router.get('/users', asyncHandler(adminController.getUsers.bind(adminController)));
router.get('/subscriptions', asyncHandler(adminController.getSubscriptions.bind(adminController)));
router.get('/ai-usage', asyncHandler(adminController.getAiUsage.bind(adminController)));
router.get('/ai-costs', asyncHandler(adminController.getAiCosts.bind(adminController)));
router.get('/ai-quality', asyncHandler(adminController.getAiQuality.bind(adminController)));
router.get(
  '/context-engineering',
  asyncHandler(adminController.getContextEngineering.bind(adminController))
);
router.get('/ai-features', asyncHandler(adminController.getAiFeatures.bind(adminController)));
router.get('/reservations', asyncHandler(adminController.getReservations.bind(adminController)));
router.get('/queue-health', asyncHandler(adminController.getQueueHealth.bind(adminController)));
router.get('/failures', asyncHandler(adminController.getFailures.bind(adminController)));
router.get('/errors', asyncHandler(adminController.getErrors.bind(adminController)));
router.post(
  '/model-routing/preview',
  validate(validateModelRoutingPreview),
  asyncHandler(adminController.previewModelRouting.bind(adminController))
);
router.post(
  '/jobs/:jobId/retry',
  validate(validateRetryJob),
  asyncHandler(adminController.retryJob.bind(adminController))
);
router.post(
  '/ai-features/:feature/enable',
  validate(validateEnableAiFeature),
  asyncHandler(adminController.enableAiFeature.bind(adminController))
);
router.post(
  '/users/:userId/unsuspend',
  validate(validateUnsuspendUser),
  asyncHandler(adminController.unsuspendUser.bind(adminController))
);
router.post(
  '/users/:userId/suspend',
  validate(validateSuspendUser),
  asyncHandler(adminController.suspendUser.bind(adminController))
);
router.post(
  '/ai-features/:feature/disable',
  validate(validateDisableAiFeature),
  asyncHandler(adminController.disableAiFeature.bind(adminController))
);

export default router;
