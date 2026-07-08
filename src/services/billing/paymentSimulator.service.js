import crypto from 'crypto';
import billingEventQueries from '../../db/queries/billingEvent.queries.js';
import subscriptionService, {
  PAID_PLAN_NAMES,
  SUPPORTED_PLAN_NAMES,
  normalizePlanName,
} from '../subscriptions/subscription.service.js';
import HttpError from '../../utils/httpError.js';

const SIMULATED_PROVIDER = 'Other';
const SUPPORTED_ACTIONS = new Set([
  'renewal',
  'cancel',
  'upgrade',
  'downgrade',
  'payment_failed',
  'expire',
]);

const ACTION_CONFIG = {
  renewal: {
    eventName: 'subscription_renewed',
    defaultStatus: 'active',
    allowedStatuses: new Set(['active', 'trialing']),
    planRequired: false,
    paidPlanRequired: true,
  },
  cancel: {
    eventName: 'subscription_cancelled',
    defaultStatus: 'cancelled',
    allowedStatuses: new Set(['cancelled', 'canceled']),
    planRequired: false,
    paidPlanRequired: false,
  },
  upgrade: {
    eventName: 'subscription_updated',
    defaultStatus: 'active',
    allowedStatuses: new Set(['active', 'trialing', 'past_due']),
    planRequired: true,
    paidPlanRequired: true,
  },
  downgrade: {
    eventName: 'subscription_updated',
    defaultStatus: 'active',
    allowedStatuses: new Set(['active', 'trialing', 'past_due']),
    planRequired: true,
    paidPlanRequired: true,
  },
  payment_failed: {
    eventName: 'payment_failed',
    defaultStatus: 'past_due',
    allowedStatuses: new Set(['past_due']),
    planRequired: false,
    paidPlanRequired: true,
  },
  expire: {
    eventName: 'subscription_cancelled',
    defaultStatus: 'expired',
    allowedStatuses: new Set(['expired']),
    planRequired: false,
    paidPlanRequired: false,
  },
};

function validationError(details) {
  throw new HttpError(422, 'Invalid billing simulation payload', {
    code: 'VALIDATION_ERROR',
    details: Array.isArray(details) ? details : [details],
  });
}

function normalizeUserId(userId) {
  const normalized = Number(userId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    validationError({ field: 'userId', message: 'userId must be a positive integer.' });
  }

  return normalized;
}

function normalizeAction(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';

  if (!SUPPORTED_ACTIONS.has(normalized)) {
    validationError({ field: 'action', message: 'action must be a supported billing simulation action.' });
  }

  return normalized;
}

function normalizeStatus(status, config) {
  const normalized = typeof status === 'string' && status.trim()
    ? status.trim().toLowerCase()
    : config.defaultStatus;
  const canonicalStatus = normalized === 'canceled' ? 'cancelled' : normalized;

  if (!config.allowedStatuses.has(normalized) && !config.allowedStatuses.has(canonicalStatus)) {
    validationError({ field: 'status', message: 'status is not valid for the selected action.' });
  }

  return canonicalStatus;
}

function normalizeEffectiveAt(effectiveAt) {
  if (effectiveAt === undefined || effectiveAt === null || effectiveAt === '') {
    return new Date().toISOString();
  }

  if (typeof effectiveAt !== 'string') {
    validationError({ field: 'effectiveAt', message: 'effectiveAt must be an ISO date string.' });
  }

  const normalized = new Date(effectiveAt);

  if (Number.isNaN(normalized.getTime())) {
    validationError({ field: 'effectiveAt', message: 'effectiveAt must be a valid ISO date string.' });
  }

  return normalized.toISOString();
}

function normalizeAmountPaid(amountPaid) {
  if (amountPaid === undefined || amountPaid === null || amountPaid === '') {
    return null;
  }

  const normalized = Number(amountPaid);

  if (!Number.isInteger(normalized) || normalized < 0) {
    validationError({ field: 'amountPaid', message: 'amountPaid must be a non-negative integer in minor currency units.' });
  }

  return normalized;
}

function normalizeCurrency(currency) {
  if (currency === undefined || currency === null || currency === '') {
    return 'usd';
  }

  if (typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency.trim())) {
    validationError({ field: 'currency', message: 'currency must be a three-letter currency code.' });
  }

  return currency.trim().toLowerCase();
}

function resolvePlanName({ plan, currentPlan, config }) {
  const hasPlan = typeof plan === 'string' && plan.trim();

  if (config.planRequired && !hasPlan) {
    validationError({ field: 'plan', message: 'plan is required for the selected action.' });
  }

  const fallbackPlan = currentPlan?.name || 'PRO';
  const normalizedPlan = normalizePlanName(hasPlan ? plan : fallbackPlan, fallbackPlan);

  if (!SUPPORTED_PLAN_NAMES.has(normalizedPlan)) {
    validationError({ field: 'plan', message: 'plan must be one of FREE, PRO, or GUIDE.' });
  }

  if (config.paidPlanRequired && !PAID_PLAN_NAMES.has(normalizedPlan)) {
    validationError({ field: 'plan', message: 'plan must be PRO or GUIDE for the selected action.' });
  }

  return normalizedPlan;
}

function buildProviderEventId({
  userId,
  action,
  planName,
  status,
  amountPaid,
  currency,
  effectiveAt,
  idempotencyKey,
}) {
  const seed = idempotencyKey || JSON.stringify({
    userId,
    action,
    planName,
    status,
    amountPaid,
    currency,
    effectiveAt,
  });
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);

  return `sim_${digest}`;
}

function buildProviderIds({ userId, currentPlan }) {
  return {
    providerCustomerId: currentPlan?.providerCustomerId || `sim_cus_${userId}`,
    providerSubscriptionId: currentPlan?.providerSubscriptionId || `sim_sub_${userId}`,
  };
}

function mapSubscription(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    userId: Number(subscription.userId),
    plan: subscription.name,
    status: subscription.status,
  };
}

class PaymentSimulatorService {
  async simulatePayment({
    userId,
    action,
    plan,
    status,
    amountPaid,
    currency,
    effectiveAt,
    idempotencyKey,
  }) {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedAction = normalizeAction(action);
    const config = ACTION_CONFIG[normalizedAction];
    const currentPlan = await subscriptionService.getUserPlan(normalizedUserId);
    const normalizedStatus = normalizeStatus(status, config);
    const normalizedEffectiveAt = normalizeEffectiveAt(effectiveAt);
    const normalizedAmountPaid = normalizeAmountPaid(amountPaid);
    const normalizedCurrency = normalizeCurrency(currency);
    const planName = resolvePlanName({ plan, currentPlan, config });
    const {
      providerCustomerId,
      providerSubscriptionId,
    } = buildProviderIds({ userId: normalizedUserId, currentPlan });
    const providerPriceId = `sim_price_${planName.toLowerCase()}`;
    const providerEventId = buildProviderEventId({
      userId: normalizedUserId,
      action: normalizedAction,
      planName,
      status: normalizedStatus,
      amountPaid: normalizedAmountPaid,
      currency: normalizedCurrency,
      effectiveAt: normalizedEffectiveAt,
      idempotencyKey,
    });
    const billingEvent = await billingEventQueries.recordProviderEvent({
      provider: SIMULATED_PROVIDER,
      providerEventId,
      eventType: `internal.billing_simulator.${normalizedAction}`,
      eventName: config.eventName,
      providerObjectId: providerSubscriptionId,
      providerCustomerId,
      providerSubscriptionId,
      providerInvoiceId: config.eventName === 'subscription_renewed' || config.eventName === 'payment_failed'
        ? `sim_invoice_${providerEventId}`
        : null,
      status: normalizedStatus,
      eventData: {
        simulated: true,
        internal: true,
        action: normalizedAction,
        planName,
        amountPaid: normalizedAmountPaid,
        currency: normalizedCurrency,
        effectiveAt: normalizedEffectiveAt,
      },
    });

    if (billingEvent?.inserted === false) {
      return {
        simulated: true,
        duplicate: true,
        action: normalizedAction,
        userId: normalizedUserId,
        plan: planName,
        status: normalizedStatus,
        subscription: mapSubscription(currentPlan),
        billingEvent,
      };
    }

    const subscription = await subscriptionService.syncProviderSubscription({
      userId: normalizedUserId,
      billingProvider: SIMULATED_PROVIDER,
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      providerStatus: normalizedStatus,
      planName,
      currentPeriodEnd: normalizedEffectiveAt,
    });

    await billingEventQueries.markProviderEventProcessed({
      provider: SIMULATED_PROVIDER,
      providerEventId,
    });

    return {
      simulated: true,
      action: normalizedAction,
      userId: normalizedUserId,
      plan: planName,
      status: normalizedStatus,
      subscription: mapSubscription(subscription),
      billingEvent,
    };
  }
}

export {
  ACTION_CONFIG,
  PaymentSimulatorService,
  SUPPORTED_ACTIONS,
  buildProviderEventId,
  normalizeAction,
  normalizeUserId,
  resolvePlanName,
};
export default new PaymentSimulatorService();
