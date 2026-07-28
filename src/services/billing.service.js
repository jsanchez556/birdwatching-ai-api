import checkoutService from './billing/checkout.service.js';
import webhookService from './billing/webhook.service.js';
import adminDashboardService from './billing/adminDashboard.service.js';
import paymentSimulatorService from './billing/paymentSimulator.service.js';
import featureEconomicsService from './billing/featureEconomics.service.js';
import aiTelemetry from '../monitoring/aiTelemetry.js';

class BillingService {
  async createCheckoutSession(options) {
    try {
      return await checkoutService.createCheckoutSession(options);
    } catch (error) {
      aiTelemetry.recordOperationalError({
        type: 'PAYMENT_FAILURE',
        userId: options?.authUser?.id,
        sourceEvent: 'billing_checkout_failed',
      });
      throw error;
    }
  }

  async createCustomerPortalSession(options) {
    return checkoutService.createCustomerPortalSession(options);
  }

  async syncProviderSubscription(subscription) {
    return webhookService.syncProviderSubscription(subscription);
  }

  async handleWebhook(options) {
    try {
      return await webhookService.handleWebhook(options);
    } catch (error) {
      aiTelemetry.recordOperationalError({
        type: 'PAYMENT_FAILURE',
        sourceEvent: 'billing_webhook_failed',
      });
      throw error;
    }
  }

  async getAdminDashboard(options) {
    return adminDashboardService.getDashboard(options);
  }

  async getFeatureEconomics(options) {
    return featureEconomicsService.getEconomics(options);
  }

  async simulatePayment(options) {
    return paymentSimulatorService.simulatePayment(options);
  }
}

export {
  assertCheckoutMapping,
  normalizeCheckoutPlan,
  normalizeProviderName,
  resolveBillingProvider,
} from './billing/checkout.service.js';
export { BillingService };
export default new BillingService();
