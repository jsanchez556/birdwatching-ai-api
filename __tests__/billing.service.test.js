import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockGetUserPlan = jest.fn();
const mockGetDefaultProviderMapping = jest.fn();
const mockSyncProviderSubscription = jest.fn();
const mockUpdateProviderSubscription = jest.fn();
const mockEnsureDefaultSubscription = jest.fn();
const mockRecordProviderEvent = jest.fn();
const mockMarkProviderEventProcessed = jest.fn();
const mockWarn = jest.fn();

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    billing: {
      defaultProvider: 'stripe',
      providers: ['stripe'],
    },
    stripe: {
      secretKey: 'sk_test_123',
      webhookSecret: 'whsec_test_123',
      proPriceId: undefined,
      guidePriceId: undefined,
      checkoutSuccessUrl: '',
      checkoutCancelUrl: '',
      portalReturnUrl: '',
      webhookToleranceSeconds: 300,
    },
  },
}));

await jest.unstable_mockModule('../src/services/plan.service.js', () => ({
  PRO_PLAN_NAME: 'PRO',
  default: {
    getUserPlan: mockGetUserPlan,
    ensureDefaultSubscription: mockEnsureDefaultSubscription,
    syncProviderSubscription: mockSyncProviderSubscription,
    updateProviderSubscription: mockUpdateProviderSubscription,
  },
}));

await jest.unstable_mockModule('../src/services/subscriptions/subscription.service.js', () => ({
  DEFAULT_PLAN_NAME: 'FREE',
  FREE_PLAN_NAME: 'FREE',
  GUIDE_PLAN_NAME: 'GUIDE',
  PRO_PLAN_NAME: 'PRO',
  PAID_PLAN_NAMES: new Set(['PRO', 'GUIDE']),
  PAID_ENTITLEMENT_STATUSES: new Set(['active', 'trialing', 'past_due']),
  PORTAL_ELIGIBLE_STATUSES: new Set(['active', 'trialing', 'past_due']),
  STRIPE_STATUS_MAP: new Map(),
  SUPPORTED_PLAN_NAMES: new Set(['FREE', 'PRO', 'GUIDE']),
  isPaidPlanName: (planName) => ['PRO', 'GUIDE'].includes(String(planName || '').trim().toUpperCase()),
  isSupportedPlanName: (planName) => ['FREE', 'PRO', 'GUIDE'].includes(String(planName || '').trim().toUpperCase()),
  normalizePlanName: (planName, fallback = 'FREE') => (
    typeof planName === 'string' && planName.trim() ? planName.trim().toUpperCase() : fallback
  ),
  normalizeSubscriptionStatus: (status) => ({
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'cancelled',
    cancelled: 'cancelled',
    unpaid: 'expired',
    incomplete_expired: 'expired',
  }[status] || 'expired'),
  planNameForProviderStatus: (status, planName = 'PRO') => (
    ['active', 'trialing', 'past_due'].includes(status) ? planName : 'FREE'
  ),
  SubscriptionService: class {},
  default: {
    getUserPlan: mockGetUserPlan,
    ensureDefaultSubscription: mockEnsureDefaultSubscription,
    syncProviderSubscription: mockSyncProviderSubscription,
    updateProviderSubscription: mockUpdateProviderSubscription,
  },
}));

await jest.unstable_mockModule('../src/services/providerMapping.service.js', () => ({
  normalizeProviderMappingName: (provider) => ({
    stripe: 'Stripe',
    tilopay: 'TiloPay',
    tilo_pay: 'TiloPay',
    bac: 'BAC',
    other: 'Other',
  }[String(provider || '').trim().toLowerCase()] || provider),
  default: {
    getDefaultPlanMapping: mockGetDefaultProviderMapping,
  },
}));

await jest.unstable_mockModule('../src/db/queries/billingEvent.queries.js', () => ({
  default: {
    recordProviderEvent: mockRecordProviderEvent,
    markProviderEventProcessed: mockMarkProviderEventProcessed,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: mockWarn,
    error: jest.fn(),
  },
}));

const { BillingService } = await import('../src/services/billing.service.js');
const { StripeBillingProvider } = await import('../src/providers/billing/stripe.provider.js');

function buildStripeSignature(payload, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', 'whsec_test_123')
    .update(`${timestamp}.${payload.toString('utf8')}`)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

describe('BillingService provider orchestration', () => {
  let billingService;

  beforeEach(() => {
    billingService = new BillingService();
    jest.clearAllMocks();
    mockRecordProviderEvent.mockResolvedValue({ inserted: true });
    mockMarkProviderEventProcessed.mockResolvedValue({});
    global.fetch = jest.fn();
  });

  it('creates a provider-neutral checkout response through the selected provider', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'active',
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
    });
    mockGetDefaultProviderMapping.mockResolvedValue({
      planId: 2,
      planName: 'PRO',
      provider: 'Stripe',
      providerPriceId: 'price_pro_database',
      isDefault: true,
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
    });

    await expect(billingService.createCheckoutSession({
      authUser: {
        id: 7,
        email: 'ana@example.com',
      },
      origin: 'https://birding.example.com/app/',
      providerName: 'stripe',
    })).resolves.toEqual({
      provider: 'Stripe',
      plan: 'PRO',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      paymentUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
          'Stripe-Version': '2026-02-25.clover',
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.any(URLSearchParams),
      })
    );
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('mode=subscription');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('line_items%5B0%5D%5Bprice%5D=price_pro_database');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('metadata%5BuserId%5D=7');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('subscription_data%5Bmetadata%5D%5Bplan%5D=PRO');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('metadata%5BproviderPriceId%5D=price_pro_database');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('subscription_data%5Bmetadata%5D%5BproviderPriceId%5D=price_pro_database');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('customer=cus_123');
    expect(String(global.fetch.mock.calls[0][1].body)).not.toContain('customer_email');
    expect(mockGetDefaultProviderMapping).toHaveBeenCalledWith({
      planName: 'PRO',
      provider: 'Stripe',
    });
  });

  it('fails safely when the requested plan has no default provider mapping', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'active',
      billingProvider: null,
    });
    mockGetDefaultProviderMapping.mockResolvedValue(null);

    await expect(billingService.createCheckoutSession({
      authUser: {
        id: 7,
        email: 'ana@example.com',
      },
      origin: 'https://birding.example.com',
      providerName: 'stripe',
      planName: 'PRO',
    })).rejects.toMatchObject({
      status: 500,
      code: 'BILLING_NOT_CONFIGURED',
      message: 'Billing is not configured.',
    });

    expect(mockGetDefaultProviderMapping).toHaveBeenCalledWith({
      planName: 'PRO',
      provider: 'Stripe',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('creates checkout for the GUIDE plan without leaking Stripe identifiers', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'active',
      billingProvider: null,
    });
    mockGetDefaultProviderMapping.mockResolvedValue({
      planId: 3,
      planName: 'GUIDE',
      provider: 'Stripe',
      providerPriceId: 'price_guide_database',
      isDefault: true,
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_guide' }),
    });

    await expect(billingService.createCheckoutSession({
      authUser: {
        id: 7,
        email: 'ana@example.com',
      },
      origin: 'https://birding.example.com',
      providerName: 'stripe',
      planName: 'guide',
    })).resolves.toEqual({
      provider: 'Stripe',
      plan: 'GUIDE',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_guide',
      paymentUrl: 'https://checkout.stripe.com/c/pay/cs_test_guide',
    });

    expect(String(global.fetch.mock.calls[0][1].body)).toContain('line_items%5B0%5D%5Bprice%5D=price_guide_database');
    expect(String(global.fetch.mock.calls[0][1].body)).toContain('subscription_data%5Bmetadata%5D%5Bplan%5D=GUIDE');
  });

  it('handles FREE plan requests without creating provider checkout', async () => {
    mockEnsureDefaultSubscription.mockResolvedValue({ plan: 'FREE' });

    await expect(billingService.createCheckoutSession({
      authUser: {
        id: 7,
        email: 'ana@example.com',
      },
      origin: 'https://birding.example.com',
      providerName: 'stripe',
      planName: 'FREE',
    })).resolves.toEqual({
      provider: null,
      plan: 'FREE',
      checkoutUrl: null,
      paymentUrl: null,
    });

    expect(mockEnsureDefaultSubscription).toHaveBeenCalledWith(7);
    expect(mockGetUserPlan).not.toHaveBeenCalled();
    expect(mockGetDefaultProviderMapping).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('creates a provider-neutral billing management session for an active subscription', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'active',
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://billing.stripe.com/session/test_123' }),
    });

    await expect(billingService.createCustomerPortalSession({
      authUser: { id: 7 },
      origin: 'https://birding.example.com/',
    })).resolves.toEqual({
      provider: 'Stripe',
      managementUrl: 'https://billing.stripe.com/session/test_123',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/billing_portal/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.any(URLSearchParams),
      })
    );
    expect(String(global.fetch.mock.calls[0][1].body)).toBe(
      'customer=cus_123&return_url=https%3A%2F%2Fbirding.example.com%2F%3Fbilling%3Dportal'
    );
    expect(mockGetUserPlan).toHaveBeenCalledWith(7);
  });

  it('allows billing management for past-due subscriptions during dunning', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'past_due',
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://billing.stripe.com/session/test_123' }),
    });

    await expect(billingService.createCustomerPortalSession({
      authUser: { id: 7 },
      origin: 'https://birding.example.com/',
    })).resolves.toEqual({
      provider: 'Stripe',
      managementUrl: 'https://billing.stripe.com/session/test_123',
    });
  });

  it('rejects accounts without an active subscription for the selected provider', async () => {
    mockGetUserPlan.mockResolvedValue({
      status: 'active',
      billingProvider: 'TiloPay',
      providerCustomerId: 'customer-123',
      providerSubscriptionId: 'subscription-123',
    });

    await expect(billingService.createCustomerPortalSession({
      authUser: { id: 7 },
      origin: 'https://birding.example.com',
      providerName: 'stripe',
    })).rejects.toMatchObject({
      status: 409,
      code: 'BILLING_SUBSCRIPTION_NOT_FOUND',
      message: 'No active billing subscription is available for this account.',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported billing providers before calling provider APIs', async () => {
    await expect(billingService.createCheckoutSession({
      authUser: { id: 7 },
      origin: 'https://birding.example.com',
      providerName: 'tilopay',
    })).rejects.toMatchObject({
      status: 422,
      code: 'BILLING_PROVIDER_NOT_ENABLED',
    });

    expect(mockGetUserPlan).not.toHaveBeenCalled();
    expect(mockGetDefaultProviderMapping).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated portal session requests', async () => {
    await expect(billingService.createCustomerPortalSession({
      authUser: null,
      origin: 'https://birding.example.com',
    })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required',
    });

    expect(mockGetUserPlan).not.toHaveBeenCalled();
    expect(mockGetDefaultProviderMapping).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('syncs provider-neutral subscription state from checkout webhooks', async () => {
    const event = {
      id: 'evt_checkout_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          client_reference_id: '7',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        metadata: {
          plan: 'GUIDE',
        },
        current_period_end: 1_735_689_600,
        items: {
          data: [
            {
              price: {
                id: 'price_pro',
              },
            },
          ],
        },
      }),
    });
    mockUpdateProviderSubscription.mockResolvedValue(null);
    mockSyncProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'active',
    });

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/subscriptions/sub_123',
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
    expect(mockSyncProviderSubscription).toHaveBeenCalledWith({
      userId: 7,
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      providerStatus: 'active',
      planName: 'GUIDE',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'Stripe',
      providerEventId: 'evt_checkout_123',
      eventType: 'checkout.session.completed',
      eventName: 'checkout_completed',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
    }));
    expect(mockMarkProviderEventProcessed).toHaveBeenCalledWith({
      provider: 'Stripe',
      providerEventId: 'evt_checkout_123',
    });
  });

  it('updates local subscription status when provider subscription changes', async () => {
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'past_due',
      current_period_end: 1_735_689_600,
      items: {
        data: [
          {
            price: {
              id: 'price_pro',
            },
          },
        ],
      },
    };
    const event = {
      id: 'evt_sub_updated_123',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    mockUpdateProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'past_due',
    });

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(mockUpdateProviderSubscription).toHaveBeenCalledWith({
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
      providerStatus: 'past_due',
      providerPriceId: 'price_pro',
      planName: null,
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
    expect(mockSyncProviderSubscription).not.toHaveBeenCalled();
    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: 'evt_sub_updated_123',
      eventName: 'subscription_updated',
      providerSubscriptionId: 'sub_123',
    }));
  });

  it('syncs local state when Stripe sends subscription created directly', async () => {
    const subscription = {
      id: 'sub_created_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        userId: '7',
        plan: 'PRO',
      },
      items: {
        data: [
          {
            price: {
              id: 'price_pro',
            },
          },
        ],
      },
    };
    const event = {
      id: 'evt_sub_created_123',
      type: 'customer.subscription.created',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    mockUpdateProviderSubscription.mockResolvedValue(null);
    mockSyncProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'active',
    });

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: 'evt_sub_created_123',
      eventName: 'subscription_created',
      providerSubscriptionId: 'sub_created_123',
    }));
    expect(mockSyncProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_created_123',
      providerStatus: 'active',
      planName: 'PRO',
    }));
    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
  });

  it('keeps Stripe webhook handling idempotent for duplicate provider events', async () => {
    const event = {
      id: 'evt_duplicate_123',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_duplicate_123',
          customer: 'cus_123',
          status: 'active',
        },
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    mockRecordProviderEvent.mockResolvedValue({
      inserted: false,
      processedAt: '2026-07-08T00:00:00.000Z',
    });

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      duplicate: true,
      provider: 'Stripe',
    });

    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
    expect(mockSyncProviderSubscription).not.toHaveBeenCalled();
    expect(mockMarkProviderEventProcessed).not.toHaveBeenCalled();
  });

  it('retries a previously recorded webhook that was not processed', async () => {
    const event = {
      id: 'evt_retry_123',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_retry_123',
          customer: 'cus_123',
          status: 'active',
          metadata: {
            userId: '7',
            plan: 'PRO',
          },
          items: {
            data: [
              {
                current_period_end: 1_735_689_600,
                price: {
                  id: 'price_pro',
                },
              },
            ],
          },
        },
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    mockRecordProviderEvent.mockResolvedValue({
      inserted: false,
      processedAt: null,
    });
    mockUpdateProviderSubscription.mockResolvedValue(null);
    mockSyncProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'active',
    });

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
    expect(mockSyncProviderSubscription).toHaveBeenCalled();
    expect(mockMarkProviderEventProcessed).toHaveBeenCalledWith({
      provider: 'Stripe',
      providerEventId: 'evt_retry_123',
    });
  });

  it('records payment failures without changing subscription state', async () => {
    const event = {
      id: 'evt_invoice_failed_123',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_123',
          subscription: 'sub_123',
          status: 'open',
          amount_due: 2500,
          attempt_count: 2,
        },
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: 'evt_invoice_failed_123',
      eventType: 'invoice.payment_failed',
      eventName: 'payment_failed',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerInvoiceId: 'in_123',
    }));
    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
    expect(mockSyncProviderSubscription).not.toHaveBeenCalled();
  });

  it('records successful renewal invoices without changing subscription state', async () => {
    const event = {
      id: 'evt_invoice_paid_123',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_paid_123',
          customer: 'cus_123',
          subscription: 'sub_123',
          status: 'paid',
          amount_paid: 2500,
          billing_reason: 'subscription_cycle',
        },
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(billingService.handleWebhook({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      received: true,
      provider: 'Stripe',
    });

    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: 'evt_invoice_paid_123',
      eventType: 'invoice.payment_succeeded',
      eventName: 'subscription_renewed',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerInvoiceId: 'in_paid_123',
    }));
    expect(mockUpdateProviderSubscription).not.toHaveBeenCalled();
    expect(mockSyncProviderSubscription).not.toHaveBeenCalled();
  });
});

describe('StripeBillingProvider adapter behavior', () => {
  let provider;

  beforeEach(() => {
    provider = new StripeBillingProvider();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('does not require a Stripe PRO price env var to be configured', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('requires checkout callers to provide a resolved provider price id', async () => {
    await expect(provider.createCheckoutSession({
      authUser: {
        id: 7,
        email: 'ana@example.com',
      },
      origin: 'https://birding.example.com',
      planName: 'PRO',
    })).rejects.toMatchObject({
      status: 500,
      code: 'BILLING_NOT_CONFIGURED',
      message: 'Billing is not configured.',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses a safe retryable error when Stripe cannot create the portal session', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          type: 'api_error',
          message: 'internal details',
        },
      }),
    });

    await expect(provider.createCustomerPortalSession({
      providerCustomerId: 'cus_123',
      origin: 'https://birding.example.com',
    })).rejects.toMatchObject({
      status: 502,
      code: 'BILLING_PROVIDER_REQUEST_FAILED',
      message: 'Billing is temporarily unavailable. Please try again.',
    });
    expect(mockWarn).toHaveBeenCalledWith('Billing provider request failed', expect.objectContaining({
      event: 'billing_provider_request_failed',
        provider: 'stripe',
        status: 500,
      providerErrorType: 'api_error',
    }));
  });

  it('normalizes subscription events with provider-neutral identifiers', async () => {
    const subscription = {
      id: 'sub_456',
      customer: 'cus_456',
      status: 'active',
      metadata: {
        userId: '8',
        plan: 'GUIDE',
      },
      items: {
        data: [
          {
            price: {
              id: 'price_pro',
            },
          },
        ],
      },
    };
    const event = {
      id: 'evt_sub_updated_456',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(provider.normalizeWebhookEvent({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toEqual({
      type: 'subscription_changed',
      providerEvent: expect.objectContaining({
        providerEventId: 'evt_sub_updated_456',
        eventName: 'subscription_updated',
      }),
      subscription: {
        provider: 'Stripe',
        userId: 8,
        providerCustomerId: 'cus_456',
        providerSubscriptionId: 'sub_456',
        providerPriceId: 'price_pro',
        providerStatus: 'active',
        planName: 'GUIDE',
        currentPeriodEnd: null,
      },
    });
  });

  it('normalizes an expanded Stripe customer to its provider identifier', async () => {
    const subscription = {
      id: 'sub_456',
      customer: {
        id: 'cus_456',
      },
      status: 'active',
      metadata: {
        userId: '8',
        plan: 'PRO',
      },
      items: {
        data: [
          {
            price: {
              id: 'price_pro',
            },
          },
        ],
      },
    };
    const event = {
      id: 'evt_sub_customer_456',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(provider.normalizeWebhookEvent({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toMatchObject({
      subscription: {
        providerCustomerId: 'cus_456',
      },
    });
  });

  it('uses subscription metadata as a provider price fallback', async () => {
    const subscription = {
      id: 'sub_456',
      customer: 'cus_456',
      status: 'active',
      metadata: {
        userId: '8',
        providerPriceId: 'price_pro_metadata',
      },
      items: {
        data: [],
      },
    };
    const event = {
      id: 'evt_sub_updated_789',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(provider.normalizeWebhookEvent({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toMatchObject({
      subscription: {
        providerPriceId: 'price_pro_metadata',
      },
    });
  });

  it('reads the billing period end from Stripe subscription items', async () => {
    const subscription = {
      id: 'sub_456',
      customer: 'cus_456',
      status: 'active',
      metadata: {
        userId: '8',
        plan: 'PRO',
      },
      items: {
        data: [
          {
            current_period_end: 1_735_689_600,
            price: {
              id: 'price_pro',
            },
          },
        ],
      },
    };
    const event = {
      id: 'evt_sub_period_123',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    await expect(provider.normalizeWebhookEvent({
      payload,
      headers: {
        'stripe-signature': buildStripeSignature(payload),
      },
    })).resolves.toMatchObject({
      subscription: {
        currentPeriodEnd: '2025-01-01T00:00:00.000Z',
      },
    });
  });

  it('rejects Stripe webhooks with an invalid signature', async () => {
    const payload = Buffer.from(JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
        },
      },
    }));

    await expect(provider.normalizeWebhookEvent({
      payload,
      headers: {
        'stripe-signature': 't=123,v1=bad',
      },
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_BILLING_SIGNATURE',
    });
  });
});
