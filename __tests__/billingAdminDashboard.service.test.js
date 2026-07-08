import { jest } from '@jest/globals';

const mockGetAdminDashboard = jest.fn();

await jest.unstable_mockModule('../src/db/queries/billingDashboard.queries.js', () => ({
  default: {
    getAdminDashboard: mockGetAdminDashboard,
  },
}));

const {
  default: adminDashboardService,
  mapAdminBillingDashboard,
  normalizeMonthStart,
} = await import('../src/services/billing/adminDashboard.service.js');

describe('AdminBillingDashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps admin billing metrics for dashboard cards', async () => {
    mockGetAdminDashboard.mockResolvedValue({
      monthly_revenue: '2450.00',
      mrr: '2450.00',
      arr: '29400.00',
      active_subscriptions: '103',
      cancelled_subscriptions: '7',
      revenue_by_plan: [
        {
          plan: 'PRO',
          monthlyRevenue: '1500.00',
          activeSubscriptions: 84,
        },
        {
          plan: 'GUIDE',
          monthlyRevenue: '950.00',
          activeSubscriptions: 19,
        },
      ],
    });

    await expect(adminDashboardService.getDashboard({
      monthStart: '2026-07-01',
    })).resolves.toEqual({
      monthlyRevenue: 2450,
      mrr: 2450,
      arr: 29400,
      activeSubscriptions: 103,
      cancelledSubscriptions: 7,
      revenueByPlan: [
        {
          plan: 'PRO',
          monthlyRevenue: 1500,
          activeSubscriptions: 84,
        },
        {
          plan: 'GUIDE',
          monthlyRevenue: 950,
          activeSubscriptions: 19,
        },
      ],
    });

    expect(mockGetAdminDashboard).toHaveBeenCalledWith({
      monthStart: '2026-07-01T00:00:00.000Z',
    });
  });

  it('returns zero metrics when the dashboard has no rows', () => {
    expect(mapAdminBillingDashboard(null)).toEqual({
      monthlyRevenue: 0,
      mrr: 0,
      arr: 0,
      activeSubscriptions: 0,
      cancelledSubscriptions: 0,
      revenueByPlan: [],
    });
  });

  it('rejects invalid month filters before querying the database', async () => {
    await expect(adminDashboardService.getDashboard({
      monthStart: 'not-a-date',
    })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });

    expect(mockGetAdminDashboard).not.toHaveBeenCalled();
  });

  it('normalizes empty month filters to the current database month', () => {
    expect(normalizeMonthStart(null)).toBeNull();
    expect(normalizeMonthStart('')).toBeNull();
  });
});
