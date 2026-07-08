import { jest } from '@jest/globals';

const mockCreateLog = jest.fn();
const mockCreateUsageEvent = jest.fn();
const mockGetBillingUsageDashboard = jest.fn();
const mockUpdateUsageEventCost = jest.fn();

await jest.unstable_mockModule('../src/db/queries/usage.queries.js', () => ({
  default: {
    createLog: mockCreateLog,
    createUsageEvent: mockCreateUsageEvent,
    getBillingUsageDashboard: mockGetBillingUsageDashboard,
    updateUsageEventCost: mockUpdateUsageEventCost,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: usageService } = await import('../src/services/usage.service.js');

describe('UsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBillingUsageDashboard.mockResolvedValue(null);
    mockUpdateUsageEventCost.mockResolvedValue(null);
  });

  it('records OpenAI usage for an authenticated user', async () => {
    const savedLog = { user_id: 7 };
    const usageEvent = {
      id: '123',
      user_id: 7,
      feature: 'chat',
      tokens: 168,
      estimated_cost: '0.001234',
      model_usage: [
        {
          model: 'gpt-4o-mini',
          promptTokens: 123,
          completionTokens: 45,
          totalTokens: 168,
          estimatedCostUsd: 0.001234,
        },
      ],
    };

    mockCreateLog.mockResolvedValue(savedLog);
    mockUpdateUsageEventCost.mockResolvedValue(usageEvent);

    await expect(usageService.recordOpenAiUsage('7', {
      promptTokens: 123.8,
      completionTokens: 45,
      totalTokens: 168,
      estimatedCostUsd: 0.001234,
      hasEstimatedCost: true,
      modelUsage: usageEvent.model_usage,
    }, {
      usageEventId: '123',
      traceId: 'trace-1',
    })).resolves.toEqual({
      usageEvent,
      usageLog: savedLog,
      traceMetadata: {
        billingUsageEventId: '123',
        billingFeature: 'chat',
        requestCostUsd: 0.001234,
        requestTokens: 168,
        modelUsage: usageEvent.model_usage,
      },
    });

    expect(mockUpdateUsageEventCost).toHaveBeenCalledWith({
      usageEventId: 123,
      userId: 7,
      tokens: 168,
      estimatedCost: 0.001234,
      traceId: 'trace-1',
      modelUsage: usageEvent.model_usage,
    });

    expect(mockCreateLog).toHaveBeenCalledWith({
      userId: 7,
      promptTokens: 123,
      completionTokens: 45,
      estimatedCost: 0.001234,
    });
  });

  it('skips unauthenticated usage', async () => {
    await expect(usageService.recordOpenAiUsage(null, {
      promptTokens: 10,
      completionTokens: 10,
    })).resolves.toBeNull();

    expect(mockCreateLog).not.toHaveBeenCalled();
  });

  it('keeps chat resilient when persistence fails', async () => {
    mockCreateLog.mockRejectedValue(new Error('Database down'));

    await expect(usageService.recordOpenAiUsage(7, {
      promptTokens: 10,
      completionTokens: 10,
      hasEstimatedCost: false,
    })).resolves.toEqual({
      usageEvent: null,
      usageLog: null,
      traceMetadata: null,
    });
  });

  it('calculates the monthly billing dashboard from usage events', async () => {
    mockGetBillingUsageDashboard.mockResolvedValue({
      monthly_cost: '4.284999',
      monthly_requests: '142',
      monthly_tokens: '12000',
      plan_name: 'PRO',
      subscription_status: 'active',
      billing_provider: 'Stripe',
      has_provider_subscription: true,
      provider_revenue: '29.00',
      gross_profit: '24.715001',
      gross_margin_percent: '85.22',
      langsmith_trace_count: '18',
      usage_by_feature: [
        {
          feature: 'chat',
          requests: 100,
          tokens: 9000,
          cost: '3.500000',
        },
        {
          feature: 'identification',
          requests: 42,
          tokens: 3000,
          cost: '0.784999',
        },
      ],
    });

    await expect(usageService.getMonthlyDashboard('7', {
      monthStart: '2026-06-01T00:00:00.000Z',
    })).resolves.toEqual({
      monthlyCost: 4.28,
      monthlyRequests: 142,
      plan: {
        name: 'PRO',
        status: 'active',
        billingProvider: 'Stripe',
        hasProviderSubscription: true,
      },
      usage: {
        requests: 142,
        tokens: 12000,
        byFeature: [
          {
            feature: 'chat',
            requests: 100,
            tokens: 9000,
            cost: 3.5,
          },
          {
            feature: 'identification',
            requests: 42,
            tokens: 3000,
            cost: 0.784999,
          },
        ],
      },
      langSmith: {
        traceCount: 18,
      },
      profitability: {
        revenue: 29,
        cost: 4.284999,
        profit: 24.72,
        marginPercent: 85.22,
      },
    });

    expect(mockGetBillingUsageDashboard).toHaveBeenCalledWith({
      userId: 7,
      monthStart: '2026-06-01T00:00:00.000Z',
    });
  });

  it('returns a zero monthly billing dashboard for anonymous users', async () => {
    await expect(usageService.getMonthlyDashboard(null)).resolves.toEqual({
      monthlyCost: 0,
      monthlyRequests: 0,
      plan: {
        name: 'FREE',
        status: 'active',
        billingProvider: null,
        hasProviderSubscription: false,
      },
      usage: {
        requests: 0,
        tokens: 0,
        byFeature: [],
      },
      langSmith: {
        traceCount: 0,
      },
      profitability: {
        revenue: 0,
        cost: 0,
        profit: 0,
        marginPercent: null,
      },
    });

    expect(mockGetBillingUsageDashboard).not.toHaveBeenCalled();
  });
});
