import env from '../config/env.js';
import planService, { PRO_PLAN_NAME } from './plan.service.js';
import providerMappingService, { normalizeProviderMappingName } from './providerMapping.service.js';
import { getBillingProvider } from '../providers/index.js';
import HttpError from '../utils/httpError.js';

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
  const normalizedPlan = typeof planName === 'string' && planName.trim()
    ? planName.trim().toUpperCase()
    : PRO_PLAN_NAME;

  if (normalizedPlan !== PRO_PLAN_NAME) {
    throw new HttpError(422, 'Only PRO checkout is supported.', {
      code: 'BILLING_PLAN_NOT_SUPPORTED',
      details: { plan: normalizedPlan },
    });
  }

  return normalizedPlan;
}

function assertCheckoutMapping(mapping) {
  if (!mapping?.providerPriceId) {
    throw new HttpError(500, 'Billing is not configured.', {
      code: 'BILLING_NOT_CONFIGURED',
    });
  }
}

class BillingService {
  async createCheckoutSession({
    authUser,
    origin,
    providerName = null,
    planName = PRO_PLAN_NAME,
  }) {
    assertAuthenticated(authUser);

    const provider = resolveBillingProvider(providerName);
    const billingProviderName = normalizeProviderMappingName(provider.name);
    const checkoutPlanName = normalizeCheckoutPlan(planName);
    const userPlan = await planService.getUserPlan(authUser.id);
    const checkoutMapping = await providerMappingService.getDefaultPlanMapping({
      planName: checkoutPlanName,
      provider: billingProviderName,
    });
    assertCheckoutMapping(checkoutMapping);

    const providerSubscription = providerSubscriptionForPlan(userPlan, billingProviderName);
    const session = await provider.createCheckoutSession({
      authUser,
      origin,
      planName: checkoutPlanName,
      providerCustomerId: providerSubscription?.providerCustomerId,
      providerPriceId: checkoutMapping.providerPriceId,
    });

    return {
      provider: billingProviderName,
      plan: checkoutPlanName,
      paymentUrl: session.url,
    };
  }

  async createCustomerPortalSession({ authUser, origin, providerName = null }) {
    assertAuthenticated(authUser);

    const provider = resolveBillingProvider(providerName);
    const billingProviderName = normalizeProviderMappingName(provider.name);
    const userPlan = await planService.getUserPlan(authUser.id);

    if (
      userPlan?.billingProvider !== billingProviderName
      || !userPlan?.providerCustomerId
      || !userPlan?.providerSubscriptionId
      || userPlan.status !== 'active'
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

  async syncProviderSubscription(subscription = {}) {
    if (!subscription.providerSubscriptionId) {
      return null;
    }

    const updated = await planService.updateProviderSubscription({
      billingProvider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      providerStatus: subscription.providerStatus,
      providerPriceId: subscription.providerPriceId,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });

    if (updated || !subscription.userId) {
      return updated;
    }

    return planService.syncProviderSubscription({
      userId: subscription.userId,
      billingProvider: subscription.provider,
      providerCustomerId: subscription.providerCustomerId,
      providerSubscriptionId: subscription.providerSubscriptionId,
      providerPriceId: subscription.providerPriceId,
      providerStatus: subscription.providerStatus,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }

  async handleWebhook({ providerName = null, payload, headers = {} }) {
    const provider = resolveBillingProvider(providerName);
    const event = await provider.normalizeWebhookEvent({ payload, headers });

    if (event?.type === 'subscription_synced' || event?.type === 'subscription_changed') {
      await this.syncProviderSubscription(event.subscription);
    }

    return {
      received: true,
      provider: normalizeProviderMappingName(provider.name),
    };
  }
}

export {
  BillingService,
  assertCheckoutMapping,
  normalizeCheckoutPlan,
  normalizeProviderName,
  resolveBillingProvider,
};

export default new BillingService();
