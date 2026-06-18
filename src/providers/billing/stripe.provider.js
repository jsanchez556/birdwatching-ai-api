import crypto from 'crypto';
import env from '../../config/env.js';
import HttpError from '../../utils/httpError.js';
import logger from '../../utils/logger.js';

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2025-02-24.acacia';
const STRIPE_PROVIDER_NAME = 'Stripe';
const CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed';
const SUBSCRIPTION_UPDATED = 'customer.subscription.updated';
const SUBSCRIPTION_DELETED = 'customer.subscription.deleted';

function appendFormValue(params, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    params.append(key, String(value));
  }
}

function assertStripeConfig(keys) {
  for (const key of keys) {
    if (!env.stripe[key]) {
      throw new HttpError(500, 'Billing is not configured.', { code: 'BILLING_NOT_CONFIGURED' });
    }
  }
}

function normalizeOrigin(origin) {
  return typeof origin === 'string' && origin.trim()
    ? origin.replace(/\/+$/, '')
    : '';
}

function buildCheckoutUrls(origin) {
  const fallbackOrigin = normalizeOrigin(origin);

  return {
    successUrl: env.stripe.checkoutSuccessUrl || `${fallbackOrigin}/?billing=success`,
    cancelUrl: env.stripe.checkoutCancelUrl || `${fallbackOrigin}/?billing=cancelled`,
  };
}

function buildCustomerPortalReturnUrl(origin) {
  const fallbackOrigin = normalizeOrigin(origin);

  return env.stripe.portalReturnUrl || `${fallbackOrigin}/?billing=portal`;
}

function normalizePeriodEnd(value) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return new Date(normalized * 1000).toISOString();
}

function subscriptionPriceId(subscription = {}) {
  return subscription.items?.data?.[0]?.price?.id || subscription.metadata?.providerPriceId || null;
}

function subscriptionUserId(subscription = {}) {
  const value = subscription.metadata?.userId;
  const normalized = Number(value);

  return Number.isFinite(normalized) ? normalized : null;
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookSignature({ payload, signatureHeader }) {
  assertStripeConfig(['webhookSecret']);

  if (!Buffer.isBuffer(payload) || !signatureHeader) {
    throw new HttpError(400, 'Invalid billing webhook signature.', {
      code: 'INVALID_BILLING_SIGNATURE',
    });
  }

  const parts = signatureHeader.split(',').reduce((accumulator, part) => {
    const [key, value] = part.split('=');

    if (!key || !value) {
      return accumulator;
    }

    if (key === 'v1') {
      accumulator.signatures.push(value);
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, { signatures: [] });
  const timestamp = Number(parts.t);

  if (!Number.isFinite(timestamp) || parts.signatures.length === 0) {
    throw new HttpError(400, 'Invalid billing webhook signature.', {
      code: 'INVALID_BILLING_SIGNATURE',
    });
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > env.stripe.webhookToleranceSeconds) {
    throw new HttpError(400, 'Expired billing webhook signature.', {
      code: 'INVALID_BILLING_SIGNATURE',
    });
  }

  const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.stripe.webhookSecret)
    .update(signedPayload)
    .digest('hex');

  const hasMatchingSignature = parts.signatures.some((receivedSignature) =>
    timingSafeEqualString(expectedSignature, receivedSignature));

  if (!hasMatchingSignature) {
    throw new HttpError(400, 'Invalid billing webhook signature.', {
      code: 'INVALID_BILLING_SIGNATURE',
    });
  }
}

async function stripeRequest(path, { method = 'GET', form = null } = {}) {
  assertStripeConfig(['secretKey']);

  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.stripe.secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(form ? { body: form } : {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.warn('Billing provider request failed', {
      event: 'billing_provider_request_failed',
      provider: 'stripe',
      status: response.status,
      providerErrorType: payload?.error?.type,
      providerErrorCode: payload?.error?.code,
    });

    throw new HttpError(502, 'Billing is temporarily unavailable. Please try again.', {
      code: 'BILLING_PROVIDER_REQUEST_FAILED',
    });
  }

  return payload;
}

function buildSubscriptionSync(subscription = {}, {
  fallbackUserId = null,
  fallbackCustomerId = null,
  fallbackSubscriptionId = null,
  fallbackPriceId = null,
} = {}) {
  return {
    provider: STRIPE_PROVIDER_NAME,
    userId: subscriptionUserId(subscription) || fallbackUserId,
    providerCustomerId: subscription.customer || fallbackCustomerId,
    providerSubscriptionId: subscription.id || fallbackSubscriptionId,
    providerPriceId: subscriptionPriceId(subscription) || fallbackPriceId,
    providerStatus: subscription.status || 'active',
    currentPeriodEnd: normalizePeriodEnd(subscription.current_period_end),
  };
}

class StripeBillingProvider {
  name = 'stripe';
  canonicalName = STRIPE_PROVIDER_NAME;

  isConfigured() {
    return Boolean(env.stripe.secretKey);
  }

  async createCheckoutSession({
    authUser,
    origin,
    providerCustomerId = null,
    providerPriceId,
    planName = 'PRO',
  }) {
    assertStripeConfig(['secretKey']);

    if (!providerPriceId) {
      throw new HttpError(500, 'Billing is not configured.', {
        code: 'BILLING_NOT_CONFIGURED',
      });
    }

    const { successUrl, cancelUrl } = buildCheckoutUrls(origin);
    const form = new URLSearchParams();

    appendFormValue(form, 'mode', 'subscription');
    appendFormValue(form, 'line_items[0][price]', providerPriceId);
    appendFormValue(form, 'line_items[0][quantity]', 1);
    appendFormValue(form, 'success_url', successUrl);
    appendFormValue(form, 'cancel_url', cancelUrl);
    appendFormValue(form, 'client_reference_id', authUser.id);
    appendFormValue(form, 'metadata[userId]', authUser.id);
    appendFormValue(form, 'metadata[plan]', planName);
    appendFormValue(form, 'metadata[providerPriceId]', providerPriceId);
    appendFormValue(form, 'subscription_data[metadata][userId]', authUser.id);
    appendFormValue(form, 'subscription_data[metadata][plan]', planName);
    appendFormValue(form, 'subscription_data[metadata][providerPriceId]', providerPriceId);

    if (providerCustomerId) {
      appendFormValue(form, 'customer', providerCustomerId);
    } else if (authUser.email) {
      appendFormValue(form, 'customer_email', authUser.email);
    }

    const session = await stripeRequest('/checkout/sessions', {
      method: 'POST',
      form,
    });

    if (typeof session.url !== 'string' || !session.url) {
      throw new HttpError(502, 'Billing is temporarily unavailable. Please try again.', {
        code: 'BILLING_CHECKOUT_URL_MISSING',
      });
    }

    return {
      url: session.url,
    };
  }

  async createCustomerPortalSession({ origin, providerCustomerId }) {
    assertStripeConfig(['secretKey']);

    const form = new URLSearchParams();
    appendFormValue(form, 'customer', providerCustomerId);
    appendFormValue(form, 'return_url', buildCustomerPortalReturnUrl(origin));

    const session = await stripeRequest('/billing_portal/sessions', {
      method: 'POST',
      form,
    });

    if (typeof session.url !== 'string' || !session.url) {
      throw new HttpError(502, 'Billing is temporarily unavailable. Please try again.', {
        code: 'BILLING_PORTAL_URL_MISSING',
      });
    }

    return {
      url: session.url,
    };
  }

  async retrieveSubscription(subscriptionId) {
    if (!subscriptionId) {
      return null;
    }

    return stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  async constructWebhookEvent({ payload, headers = {} }) {
    verifyWebhookSignature({
      payload,
      signatureHeader: headers['stripe-signature'],
    });

    try {
      return JSON.parse(payload.toString('utf8'));
    } catch {
      throw new HttpError(400, 'Invalid billing webhook payload.', {
        code: 'INVALID_BILLING_WEBHOOK_PAYLOAD',
      });
    }
  }

  async normalizeWebhookEvent({ payload, headers }) {
    const event = await this.constructWebhookEvent({ payload, headers });
    const object = event.data?.object || {};

    if (event.type === CHECKOUT_SESSION_COMPLETED) {
      if (object.mode !== 'subscription') {
        return null;
      }

      const userId = Number(object.client_reference_id || object.metadata?.userId);
      if (!Number.isFinite(userId)) {
        logger.warn('Billing checkout session missing user reference', {
          event: 'billing_checkout_missing_user_reference',
          provider: 'stripe',
        });
        return null;
      }

      const subscription = await this.retrieveSubscription(object.subscription);

      return {
        type: 'subscription_synced',
        subscription: buildSubscriptionSync(subscription, {
          fallbackUserId: userId,
          fallbackCustomerId: object.customer || null,
          fallbackSubscriptionId: object.subscription || null,
          fallbackPriceId: object.metadata?.providerPriceId || null,
        }),
      };
    }

    if (event.type === SUBSCRIPTION_UPDATED || event.type === SUBSCRIPTION_DELETED) {
      return {
        type: 'subscription_changed',
        subscription: buildSubscriptionSync(object),
      };
    }

    return null;
  }
}

export {
  CHECKOUT_SESSION_COMPLETED,
  STRIPE_API_VERSION,
  STRIPE_PROVIDER_NAME,
  SUBSCRIPTION_DELETED,
  SUBSCRIPTION_UPDATED,
  StripeBillingProvider,
  buildCheckoutUrls,
  buildCustomerPortalReturnUrl,
  buildSubscriptionSync,
  normalizePeriodEnd,
  stripeRequest,
  verifyWebhookSignature,
};

export default new StripeBillingProvider();
