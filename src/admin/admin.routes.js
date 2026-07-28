import express from 'express';
import adminController from './admin.controller.js';
import { requireAdmin, requireAuth } from '../api/middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async.utils.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', asyncHandler(adminController.getOverview.bind(adminController)));
router.get('/users', asyncHandler(adminController.getUsers.bind(adminController)));
router.get('/subscriptions', asyncHandler(adminController.getSubscriptions.bind(adminController)));
router.get('/ai-usage', asyncHandler(adminController.getAiUsage.bind(adminController)));
router.get('/ai-costs', asyncHandler(adminController.getAiCosts.bind(adminController)));
router.get('/reservations', asyncHandler(adminController.getReservations.bind(adminController)));
router.get('/queue-health', asyncHandler(adminController.getQueueHealth.bind(adminController)));
router.get('/failures', asyncHandler(adminController.getFailures.bind(adminController)));

export default router;
