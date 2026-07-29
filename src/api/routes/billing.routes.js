import express from 'express';
import billingController from '../controllers/billing.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';

const router = express.Router();
const billingWebhookBodyParser = express.raw({ type: 'application/json' });

router.post(
  '/checkout',
  requireAuth,
  asyncHandler(billingController.createCheckoutSession.bind(billingController))
);

router.post(
  '/portal',
  requireAuth,
  asyncHandler(billingController.createCustomerPortalSession.bind(billingController))
);

router.get(
  '/usage',
  requireAuth,
  asyncHandler(billingController.getUsageDashboard.bind(billingController))
);

router.get(
  '/admin/dashboard',
  requireAuth,
  requireAdmin,
  asyncHandler(billingController.getAdminDashboard.bind(billingController))
);

router.get(
  '/admin/feature-economics',
  requireAuth,
  requireAdmin,
  asyncHandler(billingController.getFeatureEconomics.bind(billingController))
);

router.post(
  '/admin/simulate-payment',
  requireAuth,
  requireAdmin,
  asyncHandler(billingController.simulatePayment.bind(billingController))
);

router.post(
  '/webhook',
  billingWebhookBodyParser,
  asyncHandler(billingController.handleWebhook.bind(billingController))
);

router.post(
  '/webhook/:provider',
  billingWebhookBodyParser,
  asyncHandler(billingController.handleWebhook.bind(billingController))
);

export default router;
