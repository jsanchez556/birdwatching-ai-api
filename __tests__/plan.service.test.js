import { jest } from '@jest/globals';

const mockEnsureFreeSubscription = jest.fn();
const mockGetUserPlan = jest.fn();
const mockUpdateProviderSubscriptionStatus = jest.fn();
const mockUpsertProviderSubscription = jest.fn();

await jest.unstable_mockModule('../src/db/queries/plan.queries.js', () => ({
  default: {
    ensureFreeSubscription: mockEnsureFreeSubscription,
    getUserPlan: mockGetUserPlan,
    updateProviderSubscriptionStatus: mockUpdateProviderSubscriptionStatus,
    upsertProviderSubscription: mockUpsertProviderSubscription,
  },
}));

const {
  default: planService,
  normalizeSubscriptionStatus,
  planNameForProviderStatus,
} = await import('../src/services/plan.service.js');

describe('PlanService subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes provider statuses into local plan and subscription state', () => {
    expect(planNameForProviderStatus('active')).toBe('PRO');
    expect(planNameForProviderStatus('trialing')).toBe('PRO');
    expect(planNameForProviderStatus('active', 'GUIDE')).toBe('GUIDE');
    expect(planNameForProviderStatus('past_due', 'GUIDE')).toBe('GUIDE');
    expect(planNameForProviderStatus('canceled')).toBe('FREE');
    expect(planNameForProviderStatus('incomplete_expired')).toBe('FREE');
    expect(normalizeSubscriptionStatus('active')).toBe('active');
    expect(normalizeSubscriptionStatus('trialing')).toBe('trialing');
    expect(normalizeSubscriptionStatus('past_due')).toBe('past_due');
    expect(normalizeSubscriptionStatus('canceled')).toBe('cancelled');
    expect(normalizeSubscriptionStatus('incomplete_expired')).toBe('expired');
  });

  it('ensures new users default to FREE', async () => {
    mockEnsureFreeSubscription.mockResolvedValue({
      userId: 7,
      name: 'FREE',
      status: 'active',
    });

    await expect(planService.ensureDefaultSubscription(7)).resolves.toEqual({
      plan: 'FREE',
    });

    expect(mockEnsureFreeSubscription).toHaveBeenCalledWith(7);
  });

  it('falls back to FREE if the database helper returns no plan row', async () => {
    mockEnsureFreeSubscription.mockResolvedValue(null);

    await expect(planService.ensureDefaultSubscription(7)).resolves.toEqual({
      plan: 'FREE',
    });
  });

  it('activates PRO subscriptions for paid provider states', async () => {
    mockUpsertProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'trialing',
    });

    await expect(planService.syncProviderSubscription({
      userId: 7,
      billingProvider: 'stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      providerStatus: 'trialing',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    })).resolves.toEqual({
      userId: 7,
      name: 'PRO',
      status: 'trialing',
    });

    expect(mockUpsertProviderSubscription).toHaveBeenCalledWith({
      userId: 7,
      planName: 'PRO',
      status: 'trialing',
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
  });

  it('preserves paid plan for past-due subscriptions during dunning', async () => {
    mockUpsertProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'GUIDE',
      status: 'past_due',
    });

    await planService.syncProviderSubscription({
      userId: 7,
      billingProvider: 'stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      providerStatus: 'past_due',
      planName: 'GUIDE',
      currentPeriodEnd: null,
    });

    expect(mockUpsertProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      planName: 'GUIDE',
      status: 'past_due',
      billingProvider: 'Stripe',
    }));
  });

  it('downgrades cancelled and expired provider states to FREE', async () => {
    mockUpsertProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'FREE',
      status: 'cancelled',
    });

    await planService.syncProviderSubscription({
      userId: 7,
      billingProvider: 'stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      providerStatus: 'canceled',
      currentPeriodEnd: null,
    });

    expect(mockUpsertProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      planName: 'FREE',
      status: 'cancelled',
      billingProvider: 'Stripe',
    }));
  });

  it('delegates subscription status updates to the plan query module', async () => {
    mockUpdateProviderSubscriptionStatus.mockResolvedValue({
      userId: 7,
      name: 'GUIDE',
      status: 'past_due',
    });

    await expect(planService.updateProviderSubscription({
      billingProvider: 'stripe',
      providerSubscriptionId: 'sub_123',
      providerStatus: 'past_due',
      providerPriceId: 'price_pro',
      planName: 'GUIDE',
      currentPeriodEnd: null,
    })).resolves.toEqual({
      userId: 7,
      name: 'GUIDE',
      status: 'past_due',
    });

    expect(mockUpdateProviderSubscriptionStatus).toHaveBeenCalledWith({
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
      status: 'past_due',
      providerPriceId: 'price_pro',
      planName: 'GUIDE',
      currentPeriodEnd: null,
    });
  });
});
