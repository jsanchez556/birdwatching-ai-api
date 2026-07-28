import { jest } from '@jest/globals';
import {
  AdminService,
  normalizeOverviewRange,
  normalizePagination,
  normalizeRange,
  summarizeTelemetry,
} from '../src/admin/admin.service.js';

function buildRepository() {
  return {
    getOverview: jest.fn(),
    getUsers: jest.fn(),
    getSubscriptions: jest.fn(),
    getAiUsage: jest.fn(),
    getAiCosts: jest.fn(),
    getReservations: jest.fn(),
    getQueueHealth: jest.fn(),
    getFailures: jest.fn(),
  };
}

describe('AdminService', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');

  it('normalizes pagination and rejects unsafe limits', () => {
    expect(normalizePagination({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
      offset: 10,
    });
    expect(() => normalizePagination({ limit: '101' })).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });

  it('normalizes an explicit UTC reporting range and rejects reversed dates', () => {
    expect(normalizeRange({
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    }, now)).toEqual({
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-02T00:00:00.000Z',
    });

    expect(() => normalizeRange({
      startDate: '2026-07-03',
      endDate: '2026-07-02',
    }, now)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('defaults the platform overview range to the current UTC day', () => {
    expect(normalizeOverviewRange({}, now)).toEqual({
      startAt: '2026-07-28T00:00:00.000Z',
      endAt: now.toISOString(),
    });
  });

  it('aggregates the platform overview from persistence, billing, and live AI telemetry', async () => {
    const repository = buildRepository();
    repository.getOverview.mockResolvedValue({
      active_users: '147',
      completed_reservations: '42',
      ai_requests: '1294',
      ai_estimated_cost: '18.724567',
    });
    const billingDashboard = {
      getDashboard: jest.fn().mockResolvedValue({
        activeSubscriptions: 63,
        mrr: 1890,
      }),
    };
    const telemetry = {
      getSnapshot: jest.fn().mockReturnValue({
        counters: {
          tracesCompleted: 979,
          tracesFailed: 21,
        },
        latencies: [
          { durationMs: 1800 },
          { durationMs: 1880 },
        ],
      }),
    };
    const service = new AdminService({
      repository,
      billingDashboard,
      telemetry,
      clock: () => now,
    });

    await expect(service.getOverview()).resolves.toEqual({
      activeUsers: 147,
      activeSubscriptions: 63,
      mrr: 1890,
      reservations: 42,
      aiRequestsToday: 1294,
      aiCostToday: 18.72,
      averageLatencyMs: 1840,
      errorRate: 0.021,
    });

    expect(repository.getOverview).toHaveBeenCalledWith({
      startAt: '2026-07-28T00:00:00.000Z',
      endAt: now.toISOString(),
    });
    expect(billingDashboard.getDashboard).toHaveBeenCalledWith({
      monthStart: '2026-07-01T00:00:00.000Z',
    });
  });

  it('returns stable zero telemetry metrics before this process observes AI traffic', () => {
    expect(summarizeTelemetry({ counters: {}, latencies: [] })).toEqual({
      averageLatencyMs: 0,
      errorRate: 0,
    });
  });

  it('shapes paginated users without exposing password hashes', async () => {
    const repository = buildRepository();
    repository.getUsers.mockResolvedValue({
      rows: [{
        id: 7,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        plan: 'PRO',
        subscription_status: 'active',
        created_at: now.toISOString(),
        password_hash: 'must-not-leak',
      }],
      total: '26',
    });
    const service = new AdminService({ repository, clock: () => now });

    const result = await service.getUsers({ page: '2', limit: '25' });

    expect(result).toEqual({
      data: [{
        id: '7',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        plan: 'PRO',
        subscriptionStatus: 'active',
        createdAt: now.toISOString(),
      }],
      meta: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(repository.getUsers).toHaveBeenCalledWith({ page: 2, limit: 25, offset: 25 });
  });

  it('labels costs as estimates and reports missing cost records', async () => {
    const repository = buildRepository();
    repository.getAiCosts.mockResolvedValue([
      {
        feature: 'chat',
        estimated_cost: '2.500001',
        priced_requests: '4',
        unpriced_requests: '1',
      },
    ]);
    const service = new AdminService({ repository, clock: () => now });

    await expect(service.getAiCosts({})).resolves.toMatchObject({
      currency: 'USD',
      costType: 'estimated',
      totals: {
        estimatedCost: 2.500001,
        pricedRequests: 4,
        unpricedRequests: 1,
      },
    });
  });

  it('sanitizes recent failures instead of returning stored error details', async () => {
    const repository = buildRepository();
    repository.getFailures.mockResolvedValue({
      rows: [{
        id: 'job-1',
        category: 'background_job',
        failure_type: 'embedding',
        status: 'failed',
        occurred_at: now.toISOString(),
        error_message: 'secret provider response',
      }],
      total: '1',
    });
    const service = new AdminService({ repository, clock: () => now });

    const result = await service.getFailures({});

    expect(result.data[0].error).toEqual({
      code: 'JOB_FAILED',
      message: 'Background job failed',
    });
    expect(JSON.stringify(result)).not.toContain('secret provider response');
  });

  it('preserves the total when a requested page has no rows', async () => {
    const repository = buildRepository();
    repository.getReservations.mockResolvedValue({ rows: [], total: '8' });
    const service = new AdminService({ repository, clock: () => now });

    await expect(service.getReservations({ page: '3', limit: '5' })).resolves.toEqual({
      data: [],
      meta: { page: 3, limit: 5, total: 8, totalPages: 2 },
    });
  });
});
