import checkoutService from './billing/checkout.service.js';
import webhookService from './billing/webhook.service.js';
import adminDashboardService from './billing/adminDashboard.service.js';
import paymentSimulatorService from './billing/paymentSimulator.service.js';
import featureEconomicsService from './billing/featureEconomics.service.js';

class BillingService {
  async createCheckoutSession(options) {
    return checkoutService.createCheckoutSession(options);
  }

  async createCustomerPortalSession(options) {
    return checkoutService.createCustomerPortalSession(options);
  }

  async syncProviderSubscription(subscription) {
    return webhookService.syncProviderSubscription(subscription);
  }

  async handleWebhook(options) {
    return webhookService.handleWebhook(options);
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
