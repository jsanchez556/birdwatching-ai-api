import { jest } from '@jest/globals';
import {
  FeatureEconomicsService,
  mapEconomicsRows,
} from '../src/services/billing/featureEconomics.service.js';

describe('FeatureEconomicsService', () => {
  it('aggregates daily feature usage, AI cost, revenue, and contribution margin', async () => {
    const queries = {
      getEconomics: jest.fn().mockResolvedValue([
        {
          bucket_start: '2026-07-01T00:00:00.000Z',
          feature: 'chat',
          feature_usage: '8',
          tokens: '8000',
          ai_cost: '2.000000',
          allocated_subscription_revenue: '20.00',
          subscription_revenue: '30.00',
        },
        {
          bucket_start: '2026-07-01T00:00:00.000Z',
          feature: 'voice',
          feature_usage: '2',
          tokens: '2000',
          ai_cost: '1.000000',
          allocated_subscription_revenue: '5.00',
          subscription_revenue: '30.00',
        },
        {
          bucket_start: '2026-07-02T00:00:00.000Z',
          feature: null,
          feature_usage: '0',
          tokens: '0',
          ai_cost: '0',
          allocated_subscription_revenue: '0',
          subscription_revenue: '10.00',
        },
      ]),
    };
    const service = new FeatureEconomicsService({ queries });

    await expect(service.getEconomics({
      granularity: 'daily',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-03T00:00:00.000Z',
    })).resolves.toEqual({
      granularity: 'daily',
      timezone: 'UTC',
      currency: 'USD',
      range: {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-03T00:00:00.000Z',
      },
      allocationMethod: 'per_user_feature_usage_share',
      totals: {
        usage: 10,
        tokens: 10000,
        aiCost: 3,
        subscriptionRevenue: 40,
        estimatedContributionMargin: 37,
        estimatedContributionMarginPercent: 92.5,
        allocatedSubscriptionRevenue: 25,
        unallocatedSubscriptionRevenue: 15,
      },
      buckets: [
        {
          periodStart: '2026-07-01T00:00:00.000Z',
          usage: 10,
          tokens: 10000,
          aiCost: 3,
          subscriptionRevenue: 30,
          estimatedContributionMargin: 27,
          estimatedContributionMarginPercent: 90,
          allocatedSubscriptionRevenue: 25,
          unallocatedSubscriptionRevenue: 5,
          features: [
            {
              feature: 'chat',
              usage: 8,
              tokens: 8000,
              aiCost: 2,
              allocatedSubscriptionRevenue: 20,
              estimatedContributionMargin: 18,
              estimatedContributionMarginPercent: 90,
            },
            {
              feature: 'voice',
              usage: 2,
              tokens: 2000,
              aiCost: 1,
              allocatedSubscriptionRevenue: 5,
              estimatedContributionMargin: 4,
              estimatedContributionMarginPercent: 80,
            },
          ],
        },
        {
          periodStart: '2026-07-02T00:00:00.000Z',
          usage: 0,
          tokens: 0,
          aiCost: 0,
          subscriptionRevenue: 10,
          estimatedContributionMargin: 10,
          estimatedContributionMarginPercent: 100,
          allocatedSubscriptionRevenue: 0,
          unallocatedSubscriptionRevenue: 10,
          features: [],
        },
      ],
    });
    expect(queries.getEconomics).toHaveBeenCalledWith({
      granularity: 'daily',
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-03T00:00:00.000Z',
    });
  });

  it('defaults to the latest twelve monthly UTC buckets', async () => {
    const queries = {
      getEconomics: jest.fn().mockResolvedValue([]),
    };
    const service = new FeatureEconomicsService({
      queries,
      clock: () => new Date('2026-07-28T18:00:00.000Z'),
    });

    const result = await service.getEconomics();

    expect(result).toMatchObject({
      granularity: 'monthly',
      range: {
        startAt: '2025-08-01T00:00:00.000Z',
        endAt: '2026-08-01T00:00:00.000Z',
      },
    });
  });

  it('rejects invalid granularity, dates, and excessive ranges', async () => {
    const service = new FeatureEconomicsService({
      queries: { getEconomics: jest.fn() },
    });

    await expect(service.getEconomics({ granularity: 'weekly' }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    await expect(service.getEconomics({
      granularity: 'daily',
      startDate: 'not-a-date',
    })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    await expect(service.getEconomics({
      granularity: 'daily',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2026-07-01T00:00:00.000Z',
    })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  it('maps an empty query result without inventing activity', () => {
    expect(mapEconomicsRows([], {
      granularity: 'monthly',
      startAt: '2026-01-01T00:00:00.000Z',
      endAt: '2026-02-01T00:00:00.000Z',
    })).toMatchObject({
      totals: {
        usage: 0,
        aiCost: 0,
        subscriptionRevenue: 0,
        estimatedContributionMargin: 0,
        estimatedContributionMarginPercent: null,
      },
      buckets: [],
    });
  });
});
