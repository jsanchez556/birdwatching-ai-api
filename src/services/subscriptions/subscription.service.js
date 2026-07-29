import planQueries from '../../db/queries/plan.queries.js';
import { normalizeProviderMappingName } from '../providerMapping.service.js';

const DEFAULT_PLAN_NAME = 'FREE';
const FREE_PLAN_NAME = DEFAULT_PLAN_NAME;
const PRO_PLAN_NAME = 'PRO';
const GUIDE_PLAN_NAME = 'GUIDE';
const PAID_PLAN_NAMES = new Set([PRO_PLAN_NAME, GUIDE_PLAN_NAME]);
const SUPPORTED_PLAN_NAMES = new Set([FREE_PLAN_NAME, PRO_PLAN_NAME, GUIDE_PLAN_NAME]);
const PAID_ENTITLEMENT_STATUSES = new Set(['active', 'trialing', 'past_due']);
const PORTAL_ELIGIBLE_STATUSES = new Set(['active', 'trialing', 'past_due']);
const STRIPE_STATUS_MAP = new Map([
  ['trialing', 'trialing'],
  ['active', 'active'],
  ['past_due', 'past_due'],
  ['canceled', 'cancelled'],
  ['cancelled', 'cancelled'],
  ['unpaid', 'expired'],
  ['incomplete_expired', 'expired'],
  ['incomplete', 'past_due'],
  ['paused', 'expired'],
]);

function normalizeSubscriptionStatus(status) {
  return STRIPE_STATUS_MAP.get(status) || 'expired';
}

function normalizePlanName(planName, fallbackPlanName = DEFAULT_PLAN_NAME) {
  const normalizedPlan = typeof planName === 'string' && planName.trim()
    ? planName.trim().toUpperCase()
    : fallbackPlanName;

  return normalizedPlan;
}

function isSupportedPlanName(planName) {
  return SUPPORTED_PLAN_NAMES.has(normalizePlanName(planName));
}

function isPaidPlanName(planName) {
  return PAID_PLAN_NAMES.has(normalizePlanName(planName));
}

function planNameForProviderStatus(status, planName = PRO_PLAN_NAME) {
  const normalizedStatus = normalizeSubscriptionStatus(status);

  if (!PAID_ENTITLEMENT_STATUSES.has(normalizedStatus)) {
    return DEFAULT_PLAN_NAME;
  }

  const normalizedPlanName = normalizePlanName(planName, PRO_PLAN_NAME);

  return PAID_PLAN_NAMES.has(normalizedPlanName) ? normalizedPlanName : PRO_PLAN_NAME;
}

class SubscriptionService {
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
    planName = PRO_PLAN_NAME,
    currentPeriodEnd,
  }) {
    const normalizedBillingProvider = normalizeProviderMappingName(billingProvider);

    return planQueries.upsertProviderSubscription({
      userId,
      planName: planNameForProviderStatus(providerStatus, planName),
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
    planName = null,
    currentPeriodEnd,
  }) {
    const normalizedBillingProvider = normalizeProviderMappingName(billingProvider);

    return planQueries.updateProviderSubscriptionStatus({
      billingProvider: normalizedBillingProvider,
      providerSubscriptionId,
      status: providerStatus,
      providerPriceId,
      planName,
      currentPeriodEnd,
    });
  }
}

export {
  DEFAULT_PLAN_NAME,
  FREE_PLAN_NAME,
  GUIDE_PLAN_NAME,
  PAID_PLAN_NAMES,
  PAID_ENTITLEMENT_STATUSES,
  PORTAL_ELIGIBLE_STATUSES,
  PRO_PLAN_NAME,
  STRIPE_STATUS_MAP,
  SUPPORTED_PLAN_NAMES,
  SubscriptionService,
  isPaidPlanName,
  isSupportedPlanName,
  normalizePlanName,
  normalizeSubscriptionStatus,
  planNameForProviderStatus,
};
export default new SubscriptionService();
