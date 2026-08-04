import adminRepository from '../../db/repositories/admin/admin.repository.js';
import { AiCostAnalyticsService } from './aiCostAnalytics.service.js';
import adminBillingDashboardService from '../billing/adminDashboard.service.js';
import queueHealthService from '../queueHealth.service.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import operationalErrorsService from './operationalErrors.service.js';
import aiQualityService from './aiQuality.service.js';
import { OPERATIONAL_ERROR_TYPE_SET } from '../../monitoring/operationalErrors.js';
import HttpError from '../../utils/httpError.js';
import { estimateCost } from '../../ai/telemetry/tokenUsage.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function validationError(field, message) {
  return new HttpError(400, 'Invalid admin query parameters', {
    code: 'VALIDATION_ERROR',
    details: [{ field, message }],
  });
}

function normalizePositiveInteger(value, field, fallback, maximum = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw validationError(field, `${field} must be a positive integer.`);
  }

  if (maximum !== null && normalized > maximum) {
    throw validationError(field, `${field} must not exceed ${maximum}.`);
  }

  return normalized;
}

function normalizePagination(query = {}) {
  const page = normalizePositiveInteger(query.page, 'page', 1);
  const limit = normalizePositiveInteger(query.limit, 'limit', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function normalizeErrorType(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !OPERATIONAL_ERROR_TYPE_SET.has(value)) {
    throw validationError(
      'type',
      `type must be one of: ${[...OPERATIONAL_ERROR_TYPE_SET].join(', ')}.`
    );
  }
  return value;
}

function normalizeDate(value, field, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw validationError(field, `${field} must be a valid ISO date string.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(field, `${field} must be a valid ISO date string.`);
  }

  return date;
}

function normalizeRange(query = {}, now = new Date()) {
  const endAt = normalizeDate(query.endDate, 'endDate', now);
  const startAt = normalizeDate(
    query.startDate,
    'startDate',
    new Date(endAt.getTime() - (30 * 24 * 60 * 60 * 1000))
  );

  if (startAt >= endAt) {
    throw validationError('startDate', 'startDate must be before endDate.');
  }

  if (endAt.getTime() - startAt.getTime() > MAX_RANGE_MS) {
    throw validationError('startDate', 'The reporting range must not exceed 366 days.');
  }

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

function normalizeOverviewRange(query = {}, now = new Date()) {
  const endAt = normalizeDate(query.endDate, 'endDate', now);
  const hasExplicitEnd = query.endDate !== undefined
    && query.endDate !== null
    && query.endDate !== '';
  const defaultStart = hasExplicitEnd
    ? new Date(endAt.getTime() - (30 * 24 * 60 * 60 * 1000))
    : new Date(Date.UTC(
      endAt.getUTCFullYear(),
      endAt.getUTCMonth(),
      endAt.getUTCDate()
    ));
  const startAt = normalizeDate(query.startDate, 'startDate', defaultStart);

  if (startAt >= endAt) {
    throw validationError('startDate', 'startDate must be before endDate.');
  }

  if (endAt.getTime() - startAt.getTime() > MAX_RANGE_MS) {
    throw validationError('startDate', 'The reporting range must not exceed 366 days.');
  }

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

function number(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function money(value) {
  return Number(number(value).toFixed(6));
}

function platformMoney(value) {
  return Number(number(value).toFixed(2));
}

function billingMonthStart(endAt) {
  const inclusiveEnd = new Date(new Date(endAt).getTime() - 1);
  return new Date(Date.UTC(
    inclusiveEnd.getUTCFullYear(),
    inclusiveEnd.getUTCMonth(),
    1
  )).toISOString();
}

function summarizeTelemetry(snapshot = {}) {
  const latencies = Array.isArray(snapshot.latencies)
    ? snapshot.latencies
      .map((entry) => number(entry?.durationMs))
      .filter((durationMs) => durationMs >= 0)
    : [];
  const counters = snapshot.counters || {};
  const completed = number(counters.tracesCompleted);
  const failed = number(counters.tracesFailed);
  const attempts = completed + failed;

  return {
    averageLatencyMs: latencies.length === 0
      ? 0
      : Number((latencies.reduce((total, value) => total + value, 0) / latencies.length).toFixed(2)),
    errorRate: attempts === 0 ? 0 : Number((failed / attempts).toFixed(4)),
  };
}

function percentile(values, target) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(target * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function unavailableMetric(denominator = 0) {
  return {
    status: 'unavailable',
    numerator: null,
    denominator,
    value: null,
    rate: null,
  };
}

function averageMetric(numerator, denominator) {
  if (denominator === 0) return unavailableMetric(0);
  return {
    status: 'available',
    numerator: Number(numerator.toFixed(6)),
    denominator,
    value: Number((numerator / denominator).toFixed(6)),
    rate: null,
  };
}

function ratioMetric(numerator, denominator) {
  if (denominator === 0) return unavailableMetric(0);
  const normalizedRate = Number((numerator / denominator).toFixed(4));
  return {
    status: 'available',
    numerator,
    denominator,
    value: normalizedRate,
    rate: normalizedRate,
  };
}

function summarizeContextEngineering(records = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const groups = new Map();
  for (const record of safeRecords) {
    const correlationId = record?.requestCorrelationId || record?.traceId;
    if (!correlationId) continue;
    const group = groups.get(correlationId) || [];
    group.push(record);
    groups.set(correlationId, group);
  }
  const requests = [...groups.values()];
  const finalGenerationRecords = requests.flatMap((group) => {
    const recordsForStage = group.filter((record) => (
      record.stage === 'generation' && !record.failureCategory
    ));
    return recordsForStage.length ? [recordsForStage[0]] : [];
  });
  const totalInputTokens = finalGenerationRecords.reduce(
    (total, record) => total + number(record.inputTokens), 0
  );
  const actualTokenRequests = finalGenerationRecords
    .filter((record) => record.inputTokenSource === 'actual').length;
  const estimatedTokenRequests = finalGenerationRecords.length - actualTokenRequests;
  const priced = finalGenerationRecords.map((record) => ({
    record,
    cost: estimateCost(record.model, {
      promptTokens: number(record.inputTokens),
      completionTokens: 0,
    }),
  }));
  const allPriced = priced.length > 0 && priced.every(({ cost }) => cost !== null);
  const costMetric = allPriced
    ? averageMetric(priced.reduce((total, entry) => total + entry.cost, 0), priced.length)
    : unavailableMetric(finalGenerationRecords.length);
  const ragEligible = finalGenerationRecords.filter((record) => record.ragEligible === true);
  const memoryEligible = finalGenerationRecords
    .filter((record) => record.memoryEligible === true);
  const failedRequests = requests.filter((group) => (
    group.some((record) => typeof record.failureCategory === 'string')
  ));

  return {
    aggregation: {
      eligibleRequests: requests.length,
      finalGenerationRequests: finalGenerationRecords.length,
      planningTraces: safeRecords.filter((record) => record.stage === 'planning').length,
      generationTraces: safeRecords.filter((record) => record.stage === 'generation').length,
      actualTokenRequests,
      estimatedTokenRequests,
      tokenSemantics: actualTokenRequests > 0
        ? (estimatedTokenRequests > 0 ? 'actual_with_estimated_fallback' : 'actual')
        : 'estimated',
      costSemantics: 'estimated_input_token_cost',
    },
    metrics: {
      averageInputTokens: averageMetric(totalInputTokens, finalGenerationRecords.length),
      contextCostPerRequest: costMetric,
      ragContextUtilization: ratioMetric(
        ragEligible.filter((record) => number(record.ragChunksSelected) > 0).length,
        ragEligible.length
      ),
      memoryRetrievalRate: ratioMetric(
        memoryEligible.filter((record) => number(record.memoriesRetrieved) > 0).length,
        memoryEligible.length
      ),
      compactionFrequency: ratioMetric(
        finalGenerationRecords.filter((record) => record.compactionTriggered === true).length,
        finalGenerationRecords.length
      ),
      contextRelatedFailureRate: ratioMetric(failedRequests.length, requests.length),
    },
  };
}

function summarizeRoutingBreakdown(records, dimension) {
  const groups = new Map();
  for (const record of records) {
    const key = record.dimensions?.[dimension] || 'unknown';
    const group = groups.get(key) || {
      key,
      executions: 0,
      successful: 0,
      userVisibleSuccessful: 0,
      latencyTotalMs: 0,
    };
    group.executions += 1;
    group.successful += record.canonical?.success === true ? 1 : 0;
    group.userVisibleSuccessful += record.dimensions?.userVisibleSuccess === true ? 1 : 0;
    group.latencyTotalMs += number(record.canonical?.latency);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      executions: group.executions,
      successRate: rate(group.successful, group.executions),
      userVisibleSuccessRate: rate(group.userVisibleSuccessful, group.executions),
      averageLatencyMs: Number((group.latencyTotalMs / group.executions).toFixed(2)),
    }))
    .sort((left, right) => right.executions - left.executions || left.key.localeCompare(right.key));
}

function summarizeModelRoutingHealth(records = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const executions = safeRecords.length;
  const successful = safeRecords.filter((record) => record.canonical?.success === true).length;
  const userVisibleSuccessful = safeRecords
    .filter((record) => record.dimensions?.userVisibleSuccess === true).length;
  const retries = safeRecords.filter((record) => number(record.canonical?.retryCount) > 0).length;
  const fallbacks = safeRecords.filter((record) => record.canonical?.fallbackModel !== null).length;
  const degraded = safeRecords.filter((record) => record.canonical?.degradedMode === true).length;
  const validations = safeRecords
    .map((record) => record.canonical?.schemaValidation)
    .filter((validation) => typeof validation?.success === 'boolean');
  const validationFailures = validations.filter((validation) => validation.success === false).length;
  const latencies = safeRecords
    .map((record) => finiteNonNegative(record.canonical?.latency))
    .filter((value) => value !== null);
  const tokenRecords = safeRecords
    .map((record) => record.canonical?.tokens)
    .filter((tokens) => tokens && typeof tokens === 'object');
  const pricedRecords = safeRecords.filter((record) => finiteNonNegative(record.canonical?.cost) !== null);

  return {
    executions,
    executionSuccessRate: rate(successful, executions),
    userVisibleSuccessRate: rate(userVisibleSuccessful, executions),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    tokens: {
      input: tokenRecords.reduce((total, tokens) => total + number(tokens.input), 0),
      output: tokenRecords.reduce((total, tokens) => total + number(tokens.output), 0),
      total: tokenRecords.reduce((total, tokens) => total + number(tokens.total), 0),
      unavailableExecutions: executions - tokenRecords.length,
    },
    estimatedCost: {
      total: money(pricedRecords.reduce((total, record) => total + number(record.canonical.cost), 0)),
      pricedExecutions: pricedRecords.length,
      unavailableExecutions: executions - pricedRecords.length,
    },
    retryRate: rate(retries, executions),
    fallbackRate: rate(fallbacks, executions),
    schemaValidationFailureRate: rate(validationFailures, validations.length),
    degradedModeRate: rate(degraded, executions),
    breakdowns: {
      taskCategory: summarizeRoutingBreakdown(safeRecords, 'taskCategory'),
      routingTier: summarizeRoutingBreakdown(safeRecords, 'routingTier'),
      selectedModel: summarizeRoutingBreakdown(safeRecords, 'selectedModel'),
      finalModel: summarizeRoutingBreakdown(safeRecords, 'finalModel'),
    },
  };
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function paginationMeta({ page, limit }, total) {
  const normalizedTotal = number(total);
  return {
    page,
    limit,
    total: normalizedTotal,
    totalPages: normalizedTotal === 0 ? 0 : Math.ceil(normalizedTotal / limit),
  };
}

function paginated(result, pagination, mapper) {
  const safeRows = Array.isArray(result)
    ? result
    : Array.isArray(result?.rows) ? result.rows : [];
  const total = Array.isArray(result)
    ? safeRows[0]?.total_count || 0
    : result?.total || 0;

  return {
    data: safeRows.map(mapper),
    meta: paginationMeta(pagination, total),
  };
}

function mapUser(row) {
  return {
    id: String(row.id),
    email: row.email,
    name: row.name || null,
    role: row.role,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
    status: row.suspended_at ? 'suspended' : 'active',
    suspendedAt: row.suspended_at ? new Date(row.suspended_at).toISOString() : null,
    suspensionReasonCode: row.suspension_reason_code || null,
    createdAt: row.created_at,
  };
}

function mapSubscription(row) {
  return {
    userId: String(row.user_id),
    email: row.email,
    plan: row.plan,
    status: row.status,
    billingProvider: row.billing_provider || null,
    currentPeriodEnd: row.current_period_end || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReservation(row) {
  return {
    id: number(row.id),
    userId: row.user_id === null ? null : String(row.user_id),
    tour: {
      id: number(row.tour_id),
      name: row.tour_name,
    },
    participants: number(row.participants),
    totalPrice: Number(number(row.total_price).toFixed(2)),
    currency: 'USD',
    createdAt: row.created_at,
  };
}

function mapFailure(row) {
  return {
    id: String(row.id),
    category: row.category,
    type: row.failure_type,
    status: row.status,
    occurredAt: row.occurred_at,
    error: {
      code: row.category === 'billing' ? 'PAYMENT_FAILED' : 'JOB_FAILED',
      message: row.category === 'billing' ? 'Payment failed' : 'Background job failed',
    },
  };
}

class AdminService {
  constructor({
    repository = adminRepository,
    costAnalytics = null,
    billingDashboard = adminBillingDashboardService,
    queueHealth = queueHealthService,
    telemetry = aiTelemetry,
    operationalErrors = operationalErrorsService,
    qualityService = aiQualityService,
    clock = () => new Date(),
  } = {}) {
    this.repository = repository;
    this.costAnalytics = costAnalytics || new AiCostAnalyticsService({ repository });
    this.billingDashboard = billingDashboard;
    this.queueHealth = queueHealth;
    this.telemetry = telemetry;
    this.operationalErrors = operationalErrors;
    this.qualityService = qualityService;
    this.clock = clock;
  }

  async getOverview(query = {}) {
    const range = normalizeOverviewRange(query, this.clock());
    const [row, billing] = await Promise.all([
      this.repository.getOverview(range),
      this.billingDashboard.getDashboard({
        monthStart: billingMonthStart(range.endAt),
      }),
    ]);
    const telemetry = summarizeTelemetry(this.telemetry.getSnapshot());
    const routingHealth = summarizeModelRoutingHealth(
      this.telemetry.getModelRoutingExecutions?.(range) || []
    );

    return {
      activeUsers: number(row?.active_users),
      activeSubscriptions: number(billing?.activeSubscriptions),
      mrr: platformMoney(billing?.mrr),
      reservations: number(row?.completed_reservations),
      aiRequestsToday: number(row?.ai_requests),
      aiCostToday: platformMoney(row?.ai_estimated_cost),
      averageLatencyMs: telemetry.averageLatencyMs,
      errorRate: telemetry.errorRate,
      routingHealth,
    };
  }

  async getUsers(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getUsers(pagination);
    return paginated(rows, pagination, mapUser);
  }

  async getSubscriptions(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getSubscriptions(pagination);
    return paginated(rows, pagination, mapSubscription);
  }

  async getAiUsage(query) {
    const range = normalizeRange(query, this.clock());
    const rows = await this.repository.getAiUsage(range);

    return {
      range: { ...range, timezone: 'UTC' },
      totals: rows.reduce((totals, row) => ({
        requests: totals.requests + number(row.requests),
        tokens: totals.tokens + number(row.tokens),
      }), {
        requests: 0,
        users: number(rows[0]?.total_users),
        tokens: 0,
      }),
      byFeature: rows.map((row) => ({
        feature: row.feature,
        requests: number(row.requests),
        users: number(row.users),
        tokens: number(row.tokens),
      })),
    };
  }

  async getAiCosts(query) {
    const range = normalizeRange(query, this.clock());
    const userLimit = normalizePositiveInteger(query?.userLimit, 'userLimit', 25, MAX_PAGE_SIZE);

    return this.costAnalytics.getAnalytics({ range, userLimit });
  }

  async getAiQuality(query = {}) {
    const range = normalizeRange(query, this.clock());
    return this.qualityService.getQualitySummary(range);
  }

  async getContextEngineering(query = {}) {
    const range = normalizeRange(query, this.clock());
    const records = this.telemetry.getContextEngineeringRecords?.(range);
    const summary = summarizeContextEngineering(records || []);
    return {
      range: { ...range, timezone: 'UTC' },
      source: {
        type: 'process_local_telemetry',
        scope: 'current_instance_bounded_retention',
      },
      ...summary,
    };
  }

  async getReservations(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getReservations(pagination);
    return paginated(rows, pagination, mapReservation);
  }

  async getQueueHealth() {
    return {
      observedAt: this.clock().toISOString(),
      ...await this.queueHealth.getStatistics(),
    };
  }

  async getFailures(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getFailures(pagination);
    return paginated(rows, pagination, mapFailure);
  }

  async getErrors(query = {}) {
    const pagination = normalizePagination(query);
    const range = normalizeRange(query, this.clock());
    const type = normalizeErrorType(query.type);
    const result = await this.operationalErrors.getErrors({
      range,
      pagination,
      type,
    });

    return {
      data: { errors: result.errors },
      meta: paginationMeta(pagination, result.total),
    };
  }
}

export {
  AdminService,
  MAX_PAGE_SIZE,
  normalizeOverviewRange,
  normalizeErrorType,
  normalizePagination,
  normalizeRange,
  summarizeTelemetry,
  summarizeModelRoutingHealth,
  summarizeContextEngineering,
};
export default new AdminService();
