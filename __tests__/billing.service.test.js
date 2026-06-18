import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockGetUserPlan = jest.fn();
const mockGetDefaultProviderMapping = jest.fn();
const mockSyncProviderSubscription = jest.fn();
const mockUpdateProviderSubscription = jest.fn();
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
      paymentUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
          'Stripe-Version': '2025-02-24.acacia',
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
    expect(mockUpdateProviderSubscription).toHaveBeenCalledWith({
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
      providerStatus: 'active',
      providerPriceId: 'price_pro',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
    expect(mockSyncProviderSubscription).toHaveBeenCalledWith({
      userId: 7,
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      providerStatus: 'active',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
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
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    };
    const payload = Buffer.from(JSON.stringify(event));

    mockUpdateProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'FREE',
      status: 'inactive',
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
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
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
      subscription: {
        provider: 'Stripe',
        userId: 8,
        providerCustomerId: 'cus_456',
        providerSubscriptionId: 'sub_456',
        providerPriceId: 'price_pro',
        providerStatus: 'active',
        currentPeriodEnd: null,
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
