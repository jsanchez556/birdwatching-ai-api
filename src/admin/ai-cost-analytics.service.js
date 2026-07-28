import adminRepository from './admin.repository.js';

function number(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function money(value) {
  return Number(number(value).toFixed(6));
}

function mapCostMetrics(row) {
  const requests = number(row?.requests);
  const pricedRequests = number(row?.priced_requests);
  const estimatedCost = money(row?.estimated_cost);

  return {
    requests,
    tokens: number(row?.tokens),
    estimatedCost,
    averageCostPerRequest: pricedRequests === 0
      ? 0
      : money(estimatedCost / pricedRequests),
    pricedRequests,
    unpricedRequests: number(row?.unpriced_requests),
  };
}

function mapDimension(rows, dimension, outputKey = dimension) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    [outputKey]: outputKey === 'userId'
      ? String(row[dimension])
      : row[dimension] || 'unknown',
    ...mapCostMetrics(row),
    ...(outputKey === 'userId' ? { plan: row.plan || 'FREE' } : {}),
  }));
}

function sumTotals(rows) {
  const totals = (Array.isArray(rows) ? rows : []).reduce((result, row) => ({
    requests: result.requests + number(row.requests),
    tokens: result.tokens + number(row.tokens),
    estimatedCost: result.estimatedCost + money(row.estimated_cost),
    pricedRequests: result.pricedRequests + number(row.priced_requests),
    unpricedRequests: result.unpricedRequests + number(row.unpriced_requests),
  }), {
    requests: 0,
    tokens: 0,
    estimatedCost: 0,
    pricedRequests: 0,
    unpricedRequests: 0,
  });

  totals.estimatedCost = money(totals.estimatedCost);
  totals.averageCostPerRequest = totals.pricedRequests === 0
    ? 0
    : money(totals.estimatedCost / totals.pricedRequests);

  return totals;
}

class AiCostAnalyticsService {
  constructor({ repository = adminRepository } = {}) {
    this.repository = repository;
  }

  async getAnalytics({ range, userLimit }) {
    const result = await this.repository.getAiCosts({
      ...range,
      userLimit,
    });

    return {
      range: { ...range, timezone: 'UTC' },
      currency: 'USD',
      costType: 'estimated',
      totals: sumTotals(result?.byFeature),
      byModel: mapDimension(result?.byModel, 'model'),
      byFeature: mapDimension(result?.byFeature, 'feature'),
      byPlan: mapDimension(result?.byPlan, 'plan'),
      byUser: mapDimension(result?.byUser, 'user_id', 'userId'),
      userLimit,
    };
  }
}

export {
  AiCostAnalyticsService,
  mapCostMetrics,
  sumTotals,
};
export default new AiCostAnalyticsService();
