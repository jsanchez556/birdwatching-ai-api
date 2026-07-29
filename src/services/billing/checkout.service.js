import env from '../../config/env.js';
import providerMappingService, { normalizeProviderMappingName } from '../providerMapping.service.js';
import subscriptionService, {
  DEFAULT_PLAN_NAME,
  FREE_PLAN_NAME,
  PORTAL_ELIGIBLE_STATUSES,
  PRO_PLAN_NAME,
  isSupportedPlanName,
  normalizePlanName,
} from '../subscriptions/subscription.service.js';
import { getBillingProvider } from '../../providers/index.js';
import HttpError from '../../utils/httpError.js';
import analytics from '../../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../../analytics/events.js';

function normalizeProviderName(providerName) {
  const candidate = typeof providerName === 'string' && providerName.trim()
    ? providerName.trim().toLowerCase()
    : env.billing.defaultProvider;

  return candidate || 'stripe';
}

function assertAuthenticated(authUser) {
  if (!authUser?.id) {
    throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
  }
}

function resolveBillingProvider(providerName) {
  const normalizedProvider = normalizeProviderName(providerName);

  if (!env.billing.providers.includes(normalizedProvider)) {
    throw new HttpError(422, 'Billing provider is not enabled.', {
      code: 'BILLING_PROVIDER_NOT_ENABLED',
      details: { provider: normalizedProvider },
    });
  }

  const provider = getBillingProvider(normalizedProvider);

  if (!provider) {
    throw new HttpError(422, 'Billing provider is not supported.', {
      code: 'BILLING_PROVIDER_NOT_SUPPORTED',
      details: { provider: normalizedProvider },
    });
  }

  if (!provider.isConfigured()) {
    throw new HttpError(500, 'Billing is not configured.', { code: 'BILLING_NOT_CONFIGURED' });
  }

  return provider;
}

function providerSubscriptionForPlan(userPlan, providerName) {
  if (userPlan?.billingProvider !== normalizeProviderMappingName(providerName)) {
    return null;
  }

  return userPlan;
}

function normalizeCheckoutPlan(planName) {
  const normalizedPlan = normalizePlanName(planName, PRO_PLAN_NAME);

  if (!isSupportedPlanName(normalizedPlan)) {
    throw new HttpError(422, 'Billing plan is not supported.', {
      code: 'BILLING_PLAN_NOT_SUPPORTED',
      details: { plan: normalizedPlan },
    });
  }

  return normalizedPlan;
}

function assertCheckoutMapping(mapping, providerPriceId = null) {
  if (!mapping?.providerPriceId && !providerPriceId) {
    throw new HttpError(500, 'Billing is not configured.', {
      code: 'BILLING_NOT_CONFIGURED',
    });
  }
}

function checkoutResponse({ provider, plan, url = null }) {
  return {
    provider,
    plan,
    checkoutUrl: url,
    paymentUrl: url,
  };
}

class CheckoutService {
  async createCheckoutSession({
    authUser,
    origin,
    providerName = null,
    planName = PRO_PLAN_NAME,
  }) {
    assertAuthenticated(authUser);

    const checkoutPlanName = normalizeCheckoutPlan(planName);

    if (checkoutPlanName === FREE_PLAN_NAME) {
      await subscriptionService.ensureDefaultSubscription(authUser.id);

      return checkoutResponse({
        provider: null,
        plan: DEFAULT_PLAN_NAME,
      });
    }

    const provider = resolveBillingProvider(providerName);
    const billingProviderName = normalizeProviderMappingName(provider.name);
    const userPlan = await subscriptionService.getUserPlan(authUser.id);
    const checkoutMapping = await providerMappingService.getDefaultPlanMapping({
      planName: checkoutPlanName,
      provider: billingProviderName,
    });
    const configuredProviderPriceId = provider.getConfiguredPlanPriceId?.(checkoutPlanName);
    const providerPriceId = checkoutMapping?.providerPriceId || configuredProviderPriceId;
    assertCheckoutMapping(checkoutMapping, providerPriceId);

    const providerSubscription = providerSubscriptionForPlan(userPlan, billingProviderName);
    const session = await provider.createCheckoutSession({
      authUser,
      origin,
      planName: checkoutPlanName,
      providerCustomerId: providerSubscription?.providerCustomerId,
      providerPriceId,
    });
    analytics.track({
      userId: authUser.id,
      event: ANALYTICS_EVENTS.CHECKOUT_STARTED,
      properties: {
        plan: checkoutPlanName,
        billingProvider: billingProviderName,
        source: 'account_upgrade',
      },
    });

    return checkoutResponse({
      provider: billingProviderName,
      plan: checkoutPlanName,
      url: session.url,
    });
  }

  async createCustomerPortalSession({ authUser, origin, providerName = null }) {
    assertAuthenticated(authUser);

    const provider = resolveBillingProvider(providerName);
    const billingProviderName = normalizeProviderMappingName(provider.name);
    const userPlan = await subscriptionService.getUserPlan(authUser.id);

    if (
      userPlan?.billingProvider !== billingProviderName
      || !userPlan?.providerCustomerId
      || !userPlan?.providerSubscriptionId
      || !PORTAL_ELIGIBLE_STATUSES.has(userPlan.status)
    ) {
      throw new HttpError(409, 'No active billing subscription is available for this account.', {
        code: 'BILLING_SUBSCRIPTION_NOT_FOUND',
      });
    }

    const session = await provider.createCustomerPortalSession({
      origin,
      providerCustomerId: userPlan.providerCustomerId,
      providerSubscriptionId: userPlan.providerSubscriptionId,
    });

    return {
      provider: billingProviderName,
      managementUrl: session.url,
    };
  }
}

export {
  CheckoutService,
  assertAuthenticated,
  assertCheckoutMapping,
  normalizeCheckoutPlan,
  normalizeProviderName,
  providerSubscriptionForPlan,
  resolveBillingProvider,
};
export default new CheckoutService();
