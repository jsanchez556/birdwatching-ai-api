import { jest } from '@jest/globals';

const mockGetUserPlan = jest.fn();
const mockSyncProviderSubscription = jest.fn();
const mockRecordProviderEvent = jest.fn();
const mockMarkProviderEventProcessed = jest.fn();

await jest.unstable_mockModule('../src/services/subscriptions/subscription.service.js', () => ({
  PAID_PLAN_NAMES: new Set(['PRO', 'GUIDE']),
  SUPPORTED_PLAN_NAMES: new Set(['FREE', 'PRO', 'GUIDE']),
  normalizePlanName: (planName, fallback = 'FREE') => (
    typeof planName === 'string' && planName.trim() ? planName.trim().toUpperCase() : fallback
  ),
  default: {
    getUserPlan: mockGetUserPlan,
    syncProviderSubscription: mockSyncProviderSubscription,
  },
}));

await jest.unstable_mockModule('../src/db/queries/billingEvent.queries.js', () => ({
  default: {
    recordProviderEvent: mockRecordProviderEvent,
    markProviderEventProcessed: mockMarkProviderEventProcessed,
  },
}));

const { default: paymentSimulatorService } = await import('../src/services/billing/paymentSimulator.service.js');

describe('PaymentSimulatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserPlan.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'active',
      providerCustomerId: 'sim_cus_7',
      providerSubscriptionId: 'sim_sub_7',
    });
    mockRecordProviderEvent.mockResolvedValue({
      provider: 'Other',
      providerEventId: 'sim_event',
      eventName: 'subscription_renewed',
      inserted: true,
    });
    mockMarkProviderEventProcessed.mockResolvedValue({});
    mockSyncProviderSubscription.mockResolvedValue({
      userId: 7,
      name: 'PRO',
      status: 'active',
    });
  });

  it('simulates a renewal and records an internal billing event', async () => {
    await expect(paymentSimulatorService.simulatePayment({
      userId: 7,
      action: 'renewal',
      plan: 'PRO',
      amountPaid: 2900,
      currency: 'usd',
      effectiveAt: '2026-07-08T00:00:00.000Z',
    })).resolves.toMatchObject({
      simulated: true,
      action: 'renewal',
      userId: 7,
      plan: 'PRO',
      status: 'active',
      subscription: {
        userId: 7,
        plan: 'PRO',
        status: 'active',
      },
      billingEvent: {
        provider: 'Other',
        eventName: 'subscription_renewed',
      },
    });

    expect(mockRecordProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'Other',
      eventType: 'internal.billing_simulator.renewal',
      eventName: 'subscription_renewed',
      providerCustomerId: 'sim_cus_7',
      providerSubscriptionId: 'sim_sub_7',
      status: 'active',
      eventData: expect.objectContaining({
        simulated: true,
        internal: true,
        action: 'renewal',
        planName: 'PRO',
        amountPaid: 2900,
        currency: 'usd',
      }),
    }));
    expect(mockSyncProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      billingProvider: 'Other',
      providerStatus: 'active',
      planName: 'PRO',
    }));
    expect(mockMarkProviderEventProcessed).toHaveBeenCalled();
  });

  it.each([
    ['cancel', 'cancelled', 'subscription_cancelled', 'FREE'],
    ['expire', 'expired', 'subscription_cancelled', 'FREE'],
    ['payment_failed', 'past_due', 'payment_failed', 'PRO'],
    ['upgrade', 'active', 'subscription_updated', 'GUIDE'],
    ['downgrade', 'active', 'subscription_updated', 'PRO'],
  ])('simulates %s lifecycle changes', async (action, status, eventName, resultingPlan) => {
    mockRecordProviderEvent.mockResolvedValue({
      provider: 'Other',
      eventName,
      inserted: true,
    });
    mockSyncProviderSubscription.mockResolvedValue({
      userId: 7,
      name: resultingPlan,
      status,
    });

    const plan = action === 'upgrade' ? 'GUIDE' : 'PRO';

    await expect(paymentSimulatorService.simulatePayment({
      userId: 7,
      action,
      plan,
      effectiveAt: '2026-07-08T00:00:00.000Z',
    })).resolves.toMatchObject({
      simulated: true,
      action,
      status,
      subscription: {
        plan: resultingPlan,
        status,
      },
      billingEvent: {
        provider: 'Other',
        eventName,
      },
    });

    expect(mockSyncProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      providerStatus: status,
      planName: plan,
    }));
  });

  it('rejects unsupported actions', async () => {
    await expect(paymentSimulatorService.simulatePayment({
      userId: 7,
      action: 'refund',
    })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });

    expect(mockRecordProviderEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid plans', async () => {
    await expect(paymentSimulatorService.simulatePayment({
      userId: 7,
      action: 'upgrade',
      plan: 'TEAM',
    })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });

    expect(mockRecordProviderEvent).not.toHaveBeenCalled();
  });

  it('skips subscription side effects for duplicate simulated events', async () => {
    mockRecordProviderEvent.mockResolvedValue({
      provider: 'Other',
      eventName: 'subscription_renewed',
      inserted: false,
    });

    await expect(paymentSimulatorService.simulatePayment({
      userId: 7,
      action: 'renewal',
      plan: 'PRO',
      effectiveAt: '2026-07-08T00:00:00.000Z',
    })).resolves.toMatchObject({
      simulated: true,
      duplicate: true,
      billingEvent: {
        inserted: false,
      },
    });

    expect(mockSyncProviderSubscription).not.toHaveBeenCalled();
    expect(mockMarkProviderEventProcessed).not.toHaveBeenCalled();
  });
});
