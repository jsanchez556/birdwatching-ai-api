import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

const { default: adminQueries } = await import('../src/db/queries/admin.queries.js');
const { AdminRepository } = await import('../src/admin/admin.repository.js');

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
      queues: { queues: new Map() },
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
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_count: '0' }] });
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

  it('reads live counts from registered queues and degrades individual failures', async () => {
    const repository = new AdminRepository({
      queries: {},
      queues: {
        queues: new Map([
          ['healthy', { getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, failed: 0 }) }],
          ['offline', { getJobCounts: jest.fn().mockRejectedValue(new Error('redis unavailable')) }],
        ]),
      },
    });

    await expect(repository.getQueueHealth()).resolves.toEqual([
      {
        name: 'healthy',
        available: true,
        counts: { waiting: 2, failed: 0 },
      },
      {
        name: 'offline',
        available: false,
        counts: null,
      },
    ]);
  });

  it('does not select raw job errors or billing payloads for recent failures', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await adminQueries.getFailures({ limit: 25, offset: 0 });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('error_message');
    expect(sql).not.toContain('event_data');
    expect(sql).not.toContain('provider_customer_id');
  });
});
