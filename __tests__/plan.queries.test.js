import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const {
  default: planQueries,
  mapPlan,
} = await import('../src/db/queries/plan.queries.js');

describe('PlanQueries provider-neutral subscription persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps provider subscription identifiers without exposing provider-specific field names', () => {
    expect(mapPlan({
      user_id: 7,
      plan_id: 2,
      plan_name: 'PRO',
      status: 'active',
      max_chats: 500,
      max_identifications: 100,
      billing_provider: 'Stripe',
      provider_customer_id: 'cus_123',
      provider_subscription_id: 'sub_123',
      provider_price_id: 'price_pro',
      current_period_end: '2026-07-01T00:00:00.000Z',
    })).toEqual({
      userId: 7,
      planId: 2,
      name: 'PRO',
      status: 'active',
      maxChats: 500,
      maxIdentifications: 100,
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
  });

  it('upserts provider subscriptions through the database function contract', async () => {
    const row = {
      user_id: 7,
      plan_name: 'PRO',
      billing_provider: 'Stripe',
      provider_subscription_id: 'sub_123',
    };
    mockQuery.mockResolvedValue({ rows: [row] });

    await expect(planQueries.upsertProviderSubscription({
      userId: 7,
      planName: 'PRO',
      status: 'active',
      billingProvider: 'Stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    })).resolves.toMatchObject({
      userId: 7,
      name: 'PRO',
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM upsert_provider_subscription($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        7,
        'PRO',
        'active',
        'Stripe',
        'cus_123',
        'sub_123',
        'price_pro',
        '2026-07-01T00:00:00.000Z',
      ]
    );
  });

  it('updates provider subscriptions through provider and subscription identifiers', async () => {
    const row = {
      user_id: 7,
      plan_name: 'GUIDE',
      billing_provider: 'Stripe',
      provider_subscription_id: 'sub_123',
      status: 'past_due',
    };
    mockQuery.mockResolvedValue({ rows: [row] });

    await expect(planQueries.updateProviderSubscriptionStatus({
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
      status: 'past_due',
      providerPriceId: 'price_pro',
      planName: 'GUIDE',
      currentPeriodEnd: null,
    })).resolves.toMatchObject({
      userId: 7,
      name: 'GUIDE',
      status: 'past_due',
      billingProvider: 'Stripe',
      providerSubscriptionId: 'sub_123',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM update_provider_subscription_status($1, $2, $3, $4, $5, $6)',
      ['Stripe', 'sub_123', 'past_due', 'price_pro', 'GUIDE', null]
    );
  });
});
