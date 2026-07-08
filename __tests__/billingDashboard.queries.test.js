import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const { default: billingDashboardQueries } = await import('../src/db/queries/billingDashboard.queries.js');

describe('BillingDashboardQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the admin billing dashboard through the database function', async () => {
    const dashboard = {
      monthly_revenue: '2450.00',
      mrr: '2450.00',
      arr: '29400.00',
    };
    mockQuery.mockResolvedValue({ rows: [dashboard] });

    await expect(billingDashboardQueries.getAdminDashboard({
      monthStart: '2026-07-01T00:00:00.000Z',
    })).resolves.toBe(dashboard);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_admin_billing_dashboard($1)',
      ['2026-07-01T00:00:00.000Z']
    );
  });
});
