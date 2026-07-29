import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

const { default: adminQueries } = await import('../src/db/queries/admin.queries.js');
const { AdminRepository } = await import('../src/db/repositories/admin/admin.repository.js');

describe('admin persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a parameterized range for the platform overview aggregation', async () => {
    mockQuery.mockResolvedValue({ rows: [{}] });
    const range = {
      startAt: '2026-07-28T00:00:00.000Z',
      endAt: '2026-07-29T00:00:00.000Z',
    };

    await adminQueries.getOverview(range);

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(parameters).toEqual([range.startAt, range.endAt]);
    expect(sql).toContain('COUNT(DISTINCT user_id)');
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('created_at < $2');
  });

  it('forwards the overview range through the repository boundary', async () => {
    const range = {
      startAt: '2026-07-28T00:00:00.000Z',
      endAt: '2026-07-29T00:00:00.000Z',
    };
    const queries = {
      getOverview: jest.fn().mockResolvedValue({ active_users: '1' }),
    };
    const repository = new AdminRepository({
      queries,
    });

    await expect(repository.getOverview(range)).resolves.toEqual({ active_users: '1' });
    expect(queries.getOverview).toHaveBeenCalledWith(range);
  });

  it('uses parameterized pagination and omits sensitive subscription provider identifiers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_count: '0' }] });

    await adminQueries.getSubscriptions({ limit: 25, offset: 50 });

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(parameters).toEqual([25, 50]);
    expect(sql).toContain('LIMIT $1 OFFSET $2');
    expect(sql).not.toContain('provider_customer_id');
    expect(sql).not.toContain('provider_subscription_id');
  });

  it('queries usage with an exclusive parameterized date range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const range = {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
    };

    await adminQueries.getAiUsage(range);

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(parameters).toEqual([range.startAt, range.endAt]);
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('created_at < $2');
  });

  it('aggregates AI cost dimensions without exposing user PII', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ model: 'gpt-4o-mini' }] })
      .mockResolvedValueOnce({ rows: [{ feature: 'chat' }] })
      .mockResolvedValueOnce({ rows: [{ plan: 'PRO' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 7 }] });
    const range = {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
      userLimit: 25,
    };

    await expect(adminQueries.getAiCosts(range)).resolves.toEqual({
      byModel: [{ model: 'gpt-4o-mini' }],
      byFeature: [{ feature: 'chat' }],
      byPlan: [{ plan: 'PRO' }],
      byUser: [{ user_id: 7 }],
    });

    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[0][0]).toContain('jsonb_array_elements');
    expect(mockQuery.mock.calls[0][1]).toEqual([range.startAt, range.endAt]);
    expect(mockQuery.mock.calls[3][1]).toEqual([range.startAt, range.endAt, 25]);
    expect(mockQuery.mock.calls.map(([sql]) => sql).join(' ')).not.toContain('users.email');
  });

  it('does not select raw job errors or billing payloads for recent failures', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await adminQueries.getFailures({ limit: 25, offset: 0 });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('error_message');
    expect(sql).not.toContain('event_data');
    expect(sql).not.toContain('provider_customer_id');
  });

  it('queries only allowlisted operational error fields in a bounded range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const options = {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
      limit: 1000,
    };

    await adminQueries.getOperationalErrors(options);

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(parameters).toEqual([options.startAt, options.endAt, 1000]);
    expect(sql).toContain("jobs.status = 'failed'");
    expect(sql).toContain("billing_events.event_name = 'payment_failed'");
    expect(sql).toContain('LIMIT $3');
    expect(sql).not.toContain('error_message');
    expect(sql).not.toContain('event_data');
    expect(sql).not.toContain('provider_event_id');
    expect(sql).not.toContain('provider_invoice_id');
  });
});
