import { jest } from '@jest/globals';
import {
  AdminService,
  normalizePagination,
  normalizeRange,
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

  it('aggregates overview data and live queue state', async () => {
    const repository = buildRepository();
    repository.getOverview.mockResolvedValue({
      total_users: '12',
      new_users: '3',
      admin_users: '1',
      active_subscriptions: '11',
      paid_active_subscriptions: '4',
      past_due_subscriptions: '1',
      cancelled_subscriptions: '2',
      ai_requests: '20',
      ai_tokens: '4000',
      ai_estimated_cost: '1.234567',
      ai_unpriced_requests: '2',
      total_reservations: '8',
      recent_reservations: '3',
      reservation_revenue: '145.50',
      recent_failures: '2',
    });
    repository.getQueueHealth.mockResolvedValue([
      { name: 'ingestion', available: true, counts: { waiting: 1, failed: 0 } },
    ]);
    const service = new AdminService({ repository, clock: () => now });

    await expect(service.getOverview()).resolves.toMatchObject({
      generatedAt: now.toISOString(),
      users: { total: 12, new: 3, admins: 1 },
      ai: {
        requests: 20,
        tokens: 4000,
        estimatedCost: 1.234567,
        unpricedRequests: 2,
        currency: 'USD',
      },
      queueHealth: {
        status: 'healthy',
        queues: { registered: 1, unavailable: 0, attention: 0 },
      },
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
