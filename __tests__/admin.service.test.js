import { jest } from '@jest/globals';
import {
  AdminService,
  normalizeOverviewRange,
  normalizePagination,
  normalizeRange,
  summarizeModelRoutingHealth,
  summarizeTelemetry,
} from '../src/services/admin/admin.service.js';

function buildRepository() {
  return {
    getOverview: jest.fn(),
    getUsers: jest.fn(),
    getSubscriptions: jest.fn(),
    getAiUsage: jest.fn(),
    getAiCosts: jest.fn(),
    getReservations: jest.fn(),
    getFailures: jest.fn(),
    getOperationalErrors: jest.fn(),
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
      routingHealth: {
        executions: 0,
        executionSuccessRate: 0,
        userVisibleSuccessRate: 0,
        latencyMs: { p50: null, p95: null, p99: null },
        tokens: { input: 0, output: 0, total: 0, unavailableExecutions: 0 },
        estimatedCost: { total: 0, pricedExecutions: 0, unavailableExecutions: 0 },
        retryRate: 0,
        fallbackRate: 0,
        schemaValidationFailureRate: 0,
        degradedModeRate: 0,
        breakdowns: {
          taskCategory: [],
          routingTier: [],
          selectedModel: [],
          finalModel: [],
        },
      },
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

  it('aggregates privacy-safe model-routing health by bounded dimensions', () => {
    const records = [
      {
        canonical: {
          success: true,
          latency: 100,
          tokens: { input: 10, output: 5, total: 15 },
          cost: 0.001,
          retryCount: 1,
          fallbackModel: null,
          schemaValidation: { success: true, errorCode: null },
          degradedMode: false,
        },
        dimensions: {
          userVisibleSuccess: true,
          taskCategory: 'general_chat',
          routingTier: 'balanced',
          selectedModel: 'gpt-4o',
          finalModel: 'gpt-4o',
        },
      },
      {
        canonical: {
          success: false,
          latency: 300,
          tokens: null,
          cost: null,
          retryCount: 0,
          fallbackModel: 'gpt-4o-mini',
          schemaValidation: { success: false, errorCode: 'invalid_json' },
          degradedMode: true,
        },
        dimensions: {
          userVisibleSuccess: true,
          taskCategory: 'general_chat',
          routingTier: 'balanced',
          selectedModel: 'gpt-4o',
          finalModel: 'gpt-4o-mini',
        },
      },
    ];

    expect(summarizeModelRoutingHealth(records)).toMatchObject({
      executions: 2,
      executionSuccessRate: 0.5,
      userVisibleSuccessRate: 1,
      latencyMs: { p50: 100, p95: 300, p99: 300 },
      tokens: { input: 10, output: 5, total: 15, unavailableExecutions: 1 },
      estimatedCost: { total: 0.001, pricedExecutions: 1, unavailableExecutions: 1 },
      retryRate: 0.5,
      fallbackRate: 0.5,
      schemaValidationFailureRate: 0.5,
      degradedModeRate: 0.5,
      breakdowns: {
        taskCategory: [{
          key: 'general_chat',
          executions: 2,
          successRate: 0.5,
          userVisibleSuccessRate: 1,
          averageLatencyMs: 200,
        }],
      },
    });
    expect(JSON.stringify(summarizeModelRoutingHealth(records)))
      .not.toMatch(/prompt|response|customer|error message/i);
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
        status: 'active',
        suspendedAt: null,
        suspensionReasonCode: null,
        subscriptionStatus: 'active',
        createdAt: now.toISOString(),
      }],
      meta: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(repository.getUsers).toHaveBeenCalledWith({ page: 2, limit: 25, offset: 25 });
  });

  it('aggregates estimated AI costs by model, feature, plan, and user', async () => {
    const repository = buildRepository();
    repository.getAiCosts.mockResolvedValue({
      byModel: [{
        model: 'gpt-4o-mini',
        requests: '5',
        tokens: '1200',
        estimated_cost: '2.500001',
        priced_requests: '4',
        unpriced_requests: '1',
      }],
      byFeature: [{
        feature: 'chat',
        requests: '5',
        tokens: '1200',
        estimated_cost: '2.500001',
        priced_requests: '4',
        unpriced_requests: '1',
      }],
      byPlan: [{
        plan: 'PRO',
        requests: '5',
        tokens: '1200',
        estimated_cost: '2.500001',
        priced_requests: '4',
        unpriced_requests: '1',
      }],
      byUser: [{
        user_id: 7,
        plan: 'PRO',
        requests: '5',
        tokens: '1200',
        estimated_cost: '2.500001',
        priced_requests: '4',
        unpriced_requests: '1',
      }],
    });
    const service = new AdminService({ repository, clock: () => now });

    await expect(service.getAiCosts({ userLimit: '10' })).resolves.toEqual({
      range: {
        startAt: '2026-06-28T12:00:00.000Z',
        endAt: now.toISOString(),
        timezone: 'UTC',
      },
      currency: 'USD',
      costType: 'estimated',
      totals: {
        requests: 5,
        tokens: 1200,
        estimatedCost: 2.500001,
        averageCostPerRequest: 0.625,
        pricedRequests: 4,
        unpricedRequests: 1,
      },
      byModel: [{
        model: 'gpt-4o-mini',
        requests: 5,
        tokens: 1200,
        estimatedCost: 2.500001,
        averageCostPerRequest: 0.625,
        pricedRequests: 4,
        unpricedRequests: 1,
      }],
      byFeature: [{
        feature: 'chat',
        requests: 5,
        tokens: 1200,
        estimatedCost: 2.500001,
        averageCostPerRequest: 0.625,
        pricedRequests: 4,
        unpricedRequests: 1,
      }],
      byPlan: [{
        plan: 'PRO',
        requests: 5,
        tokens: 1200,
        estimatedCost: 2.500001,
        averageCostPerRequest: 0.625,
        pricedRequests: 4,
        unpricedRequests: 1,
      }],
      byUser: [{
        userId: '7',
        plan: 'PRO',
        requests: 5,
        tokens: 1200,
        estimatedCost: 2.500001,
        averageCostPerRequest: 0.625,
        pricedRequests: 4,
        unpricedRequests: 1,
      }],
      userLimit: 10,
    });

    expect(repository.getAiCosts).toHaveBeenCalledWith({
      startAt: '2026-06-28T12:00:00.000Z',
      endAt: now.toISOString(),
      userLimit: 10,
    });
  });

  it('rejects an unsafe AI cost user limit before querying', async () => {
    const repository = buildRepository();
    const service = new AdminService({ repository, clock: () => now });

    await expect(service.getAiCosts({ userLimit: '101' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(repository.getAiCosts).not.toHaveBeenCalled();
  });

  it('calculates the current and immediately preceding AI quality ranges without provider calls', async () => {
    const repository = buildRepository();
    const qualityService = {
      getQualitySummary: jest.fn().mockResolvedValue({
        range: {
          startAt: '2026-07-01T00:00:00.000Z',
          endAt: '2026-07-03T00:00:00.000Z',
          timezone: 'UTC',
        },
        previousRange: {
          startAt: '2026-06-29T00:00:00.000Z',
          endAt: '2026-07-01T00:00:00.000Z',
          timezone: 'UTC',
        },
        metrics: {},
      }),
    };
    const service = new AdminService({
      repository,
      qualityService,
      clock: () => now,
    });

    await service.getAiQuality({
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });

    expect(qualityService.getQualitySummary).toHaveBeenCalledWith({
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-03T00:00:00.000Z',
    });
    expect(repository.getOverview).not.toHaveBeenCalled();
  });

  it('rejects invalid AI quality date ranges before reading evaluation results', async () => {
    const qualityService = {
      getQualitySummary: jest.fn(),
    };
    const service = new AdminService({
      repository: buildRepository(),
      qualityService,
      clock: () => now,
    });

    await expect(service.getAiQuality({
      startDate: 'not-a-date',
      endDate: '2026-07-03',
    })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    await expect(service.getAiQuality({
      startDate: '2026-07-04',
      endDate: '2026-07-03',
    })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(qualityService.getQualitySummary).not.toHaveBeenCalled();
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

  it('adds the observation time to queue statistics', async () => {
    const repository = buildRepository();
    const queueHealth = {
      getStatistics: jest.fn().mockResolvedValue({
        queues: [{
          id: 'embeddings',
          name: 'Embeddings',
          waiting: 4,
          active: 2,
          completed: 120,
          failed: 0,
          delayed: 1,
        }],
      }),
    };
    const service = new AdminService({
      repository,
      queueHealth,
      clock: () => now,
    });

    await expect(service.getQueueHealth()).resolves.toEqual({
      observedAt: now.toISOString(),
      queues: [{
        id: 'embeddings',
        name: 'Embeddings',
        waiting: 4,
        active: 2,
        completed: 120,
        failed: 0,
        delayed: 1,
      }],
    });
    expect(queueHealth.getStatistics).toHaveBeenCalledTimes(1);
  });

  it('validates operational error filters and returns object data with pagination metadata', async () => {
    const repository = buildRepository();
    const operationalErrors = {
      getErrors: jest.fn().mockResolvedValue({
        errors: [{
          id: 'error-1',
          timestamp: now.toISOString(),
          type: 'TOOL_ERROR',
          user: null,
          traceId: null,
          traceUrl: null,
          message: 'Tool execution failed',
          status: 'failed',
        }],
        total: 26,
      }),
    };
    const service = new AdminService({
      repository,
      operationalErrors,
      clock: () => now,
    });

    await expect(service.getErrors({
      page: '2',
      limit: '25',
      type: 'TOOL_ERROR',
    })).resolves.toEqual({
      data: {
        errors: [expect.objectContaining({ type: 'TOOL_ERROR' })],
      },
      meta: {
        page: 2,
        limit: 25,
        total: 26,
        totalPages: 2,
      },
    });
    expect(operationalErrors.getErrors).toHaveBeenCalledWith({
      range: {
        startAt: '2026-06-28T12:00:00.000Z',
        endAt: now.toISOString(),
      },
      pagination: {
        page: 2,
        limit: 25,
        offset: 25,
      },
      type: 'TOOL_ERROR',
    });

    await expect(service.getErrors({ type: 'NOT_A_TYPE' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
