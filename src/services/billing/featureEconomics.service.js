import featureEconomicsQueries from '../../db/queries/featureEconomics.queries.js';
import HttpError from '../../utils/httpError.js';

const GRANULARITIES = new Set(['daily', 'monthly']);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_RANGE_MS = 366 * DAY_MS;
const MAX_MONTHLY_RANGE_MS = 3 * 366 * DAY_MS;

function roundMoney(value, decimals = 6) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Number(normalized.toFixed(decimals)) : 0;
}

function marginPercent(revenue, margin) {
  return revenue > 0 ? Number(((margin / revenue) * 100).toFixed(2)) : null;
}

function invalidFilters(details) {
  return new HttpError(422, 'Invalid feature economics filters', {
    code: 'VALIDATION_ERROR',
    details,
  });
}

function normalizeGranularity(value) {
  const normalized = value || 'monthly';

  if (!GRANULARITIES.has(normalized)) {
    throw invalidFilters([{
      field: 'granularity',
      message: 'granularity must be daily or monthly.',
    }]);
  }

  return normalized;
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw invalidFilters([{ field, message: `${field} must be an ISO date string.` }]);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw invalidFilters([{ field, message: `${field} must be a valid ISO date string.` }]);
  }

  return date;
}

function defaultRange(granularity, now = new Date()) {
  if (granularity === 'daily') {
    const end = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ));
    return {
      start: new Date(end.getTime() - (30 * DAY_MS)),
      end,
    };
  }

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)),
    end,
  };
}

function normalizeRange({ granularity, startDate, endDate, now = new Date() }) {
  const defaults = defaultRange(granularity, now);
  const start = parseDate(startDate, 'startDate') || defaults.start;
  const end = parseDate(endDate, 'endDate') || defaults.end;
  const duration = end.getTime() - start.getTime();
  const maximum = granularity === 'daily' ? MAX_DAILY_RANGE_MS : MAX_MONTHLY_RANGE_MS;

  if (duration <= 0) {
    throw invalidFilters([{
      field: 'endDate',
      message: 'endDate must be after startDate.',
    }]);
  }

  if (duration > maximum) {
    throw invalidFilters([{
      field: 'endDate',
      message: granularity === 'daily'
        ? 'Daily reports cannot exceed 366 days.'
        : 'Monthly reports cannot exceed 36 months.',
    }]);
  }

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function createMetrics({
  usage = 0,
  tokens = 0,
  aiCost = 0,
  subscriptionRevenue = 0,
} = {}) {
  const normalizedCost = roundMoney(aiCost);
  const normalizedRevenue = roundMoney(subscriptionRevenue, 2);
  const contributionMargin = roundMoney(normalizedRevenue - normalizedCost);

  return {
    usage: Number(usage || 0),
    tokens: Number(tokens || 0),
    aiCost: normalizedCost,
    subscriptionRevenue: normalizedRevenue,
    estimatedContributionMargin: contributionMargin,
    estimatedContributionMarginPercent: marginPercent(
      normalizedRevenue,
      contributionMargin
    ),
  };
}

function mapEconomicsRows(rows = [], { granularity, startAt, endAt }) {
  const bucketsByStart = new Map();

  for (const row of rows) {
    const periodStart = new Date(row.bucket_start).toISOString();
    const bucket = bucketsByStart.get(periodStart) || {
      periodStart,
      features: [],
      subscriptionRevenue: roundMoney(row.subscription_revenue, 2),
    };

    if (row.feature) {
      const featureMetrics = createMetrics({
        usage: row.feature_usage,
        tokens: row.tokens,
        aiCost: row.ai_cost,
        subscriptionRevenue: row.allocated_subscription_revenue,
      });

      bucket.features.push({
        feature: row.feature,
        usage: featureMetrics.usage,
        tokens: featureMetrics.tokens,
        aiCost: featureMetrics.aiCost,
        allocatedSubscriptionRevenue: featureMetrics.subscriptionRevenue,
        estimatedContributionMargin: featureMetrics.estimatedContributionMargin,
        estimatedContributionMarginPercent: featureMetrics.estimatedContributionMarginPercent,
      });
    }

    bucketsByStart.set(periodStart, bucket);
  }

  const buckets = [...bucketsByStart.values()].map((bucket) => {
    const featureTotals = bucket.features.reduce((totals, feature) => ({
      usage: totals.usage + feature.usage,
      tokens: totals.tokens + feature.tokens,
      aiCost: totals.aiCost + feature.aiCost,
      allocatedRevenue: totals.allocatedRevenue + feature.allocatedSubscriptionRevenue,
    }), {
      usage: 0,
      tokens: 0,
      aiCost: 0,
      allocatedRevenue: 0,
    });
    const metrics = createMetrics({
      ...featureTotals,
      subscriptionRevenue: bucket.subscriptionRevenue,
    });

    return {
      periodStart: bucket.periodStart,
      ...metrics,
      allocatedSubscriptionRevenue: roundMoney(featureTotals.allocatedRevenue, 2),
      unallocatedSubscriptionRevenue: roundMoney(
        bucket.subscriptionRevenue - featureTotals.allocatedRevenue,
        2
      ),
      features: bucket.features,
    };
  });

  const totals = buckets.reduce((result, bucket) => ({
    usage: result.usage + bucket.usage,
    tokens: result.tokens + bucket.tokens,
    aiCost: result.aiCost + bucket.aiCost,
    subscriptionRevenue: result.subscriptionRevenue + bucket.subscriptionRevenue,
    allocatedRevenue: result.allocatedRevenue + bucket.allocatedSubscriptionRevenue,
  }), {
    usage: 0,
    tokens: 0,
    aiCost: 0,
    subscriptionRevenue: 0,
    allocatedRevenue: 0,
  });
  const totalMetrics = createMetrics(totals);

  return {
    granularity,
    timezone: 'UTC',
    currency: 'USD',
    range: {
      startAt,
      endAt,
    },
    allocationMethod: 'per_user_feature_usage_share',
    totals: {
      ...totalMetrics,
      allocatedSubscriptionRevenue: roundMoney(totals.allocatedRevenue, 2),
      unallocatedSubscriptionRevenue: roundMoney(
        totals.subscriptionRevenue - totals.allocatedRevenue,
        2
      ),
    },
    buckets,
  };
}

class FeatureEconomicsService {
  constructor({
    queries = featureEconomicsQueries,
    clock = () => new Date(),
  } = {}) {
    this.queries = queries;
    this.clock = clock;
  }

  async getEconomics({
    granularity: granularityInput,
    startDate,
    endDate,
  } = {}) {
    const granularity = normalizeGranularity(granularityInput);
    const range = normalizeRange({
      granularity,
      startDate,
      endDate,
      now: this.clock(),
    });
    const rows = await this.queries.getEconomics({
      granularity,
      ...range,
    });

    return mapEconomicsRows(rows, {
      granularity,
      ...range,
    });
  }
}

export {
  FeatureEconomicsService,
  createMetrics,
  mapEconomicsRows,
  normalizeGranularity,
  normalizeRange,
};
export default new FeatureEconomicsService();
