import planQueries from '../db/queries/plan.queries.js';
import { normalizeProviderMappingName } from './providerMapping.service.js';

const DEFAULT_PLAN_NAME = 'FREE';
const PRO_PLAN_NAME = 'PRO';
const ACTIVE_PROVIDER_STATUSES = new Set(['active', 'trialing']);

function normalizeSubscriptionStatus(status) {
  return ACTIVE_PROVIDER_STATUSES.has(status) ? 'active' : 'inactive';
}

function planNameForProviderStatus(status) {
  return ACTIVE_PROVIDER_STATUSES.has(status) ? PRO_PLAN_NAME : DEFAULT_PLAN_NAME;
}

class PlanService {
  async getUserPlan(userId) {
    return planQueries.getUserPlan(userId);
  }

  async ensureDefaultSubscription(userId) {
    const subscription = await planQueries.ensureFreeSubscription(userId);

    return {
      plan: subscription?.name || DEFAULT_PLAN_NAME,
    };
  }

  async syncProviderSubscription({
    userId,
    billingProvider,
    providerCustomerId,
    providerSubscriptionId,
    providerPriceId,
    providerStatus,
    currentPeriodEnd,
  }) {
    const normalizedBillingProvider = normalizeProviderMappingName(billingProvider);

    return planQueries.upsertProviderSubscription({
      userId,
      planName: planNameForProviderStatus(providerStatus),
      status: normalizeSubscriptionStatus(providerStatus),
      billingProvider: normalizedBillingProvider,
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      currentPeriodEnd,
    });
  }

  async updateProviderSubscription({
    billingProvider,
    providerSubscriptionId,
    providerStatus,
    providerPriceId,
    currentPeriodEnd,
  }) {
    const normalizedBillingProvider = normalizeProviderMappingName(billingProvider);

    return planQueries.updateProviderSubscriptionStatus({
      billingProvider: normalizedBillingProvider,
      providerSubscriptionId,
      status: providerStatus,
      providerPriceId,
      currentPeriodEnd,
    });
  }
}

export {
  DEFAULT_PLAN_NAME,
  PRO_PLAN_NAME,
  PlanService,
  normalizeSubscriptionStatus,
  planNameForProviderStatus,
};
export default new PlanService();
