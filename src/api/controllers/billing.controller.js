import billingService from '../../services/billing.service.js';
import usageService from '../../services/usage.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class BillingController {
  async createCheckoutSession(req, res) {
    const result = await billingService.createCheckoutSession({
      authUser: req.user,
      origin: req.get('origin'),
      providerName: req.body?.provider,
      planName: req.body?.plan,
    });

    return sendSuccess(res, result);
  }

  async createCustomerPortalSession(req, res) {
    const result = await billingService.createCustomerPortalSession({
      authUser: req.user,
      origin: req.get('origin'),
      providerName: req.body?.provider,
    });

    return sendSuccess(res, result);
  }

  async handleWebhook(req, res) {
    const result = await billingService.handleWebhook({
      providerName: req.params.provider,
      payload: req.body,
      headers: req.headers,
    });

    return sendSuccess(res, result);
  }

  async getUsageDashboard(req, res) {
    const result = await usageService.getMonthlyDashboard(req.user?.id);

    return sendSuccess(res, result);
  }

  async getAdminDashboard(req, res) {
    const result = await billingService.getAdminDashboard({
      monthStart: req.query?.monthStart,
    });

    return sendSuccess(res, result);
  }

  async getFeatureEconomics(req, res) {
    const result = await billingService.getFeatureEconomics({
      granularity: req.query?.granularity,
      startDate: req.query?.startDate,
      endDate: req.query?.endDate,
    });

    return sendSuccess(res, result);
  }

  async simulatePayment(req, res) {
    const result = await billingService.simulatePayment(req.body || {});

    return sendSuccess(res, result);
  }
}

export default new BillingController();
