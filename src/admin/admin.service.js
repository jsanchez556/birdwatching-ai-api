import adminRepository from './admin.repository.js';
import HttpError from '../utils/httpError.js';

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

function number(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function money(value) {
  return Number(number(value).toFixed(6));
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
    clock = () => new Date(),
  } = {}) {
    this.repository = repository;
    this.clock = clock;
  }

  async getOverview() {
    const [row, queueRows] = await Promise.all([
      this.repository.getOverview(),
      this.repository.getQueueHealth(),
    ]);
    const queueHealth = this.mapQueueHealth(queueRows);

    return {
      generatedAt: this.clock().toISOString(),
      period: {
        label: 'last_30_days',
        timezone: 'UTC',
      },
      users: {
        total: number(row?.total_users),
        new: number(row?.new_users),
        admins: number(row?.admin_users),
      },
      subscriptions: {
        active: number(row?.active_subscriptions),
        paidActive: number(row?.paid_active_subscriptions),
        pastDue: number(row?.past_due_subscriptions),
        cancelled: number(row?.cancelled_subscriptions),
      },
      ai: {
        requests: number(row?.ai_requests),
        tokens: number(row?.ai_tokens),
        estimatedCost: money(row?.ai_estimated_cost),
        unpricedRequests: number(row?.ai_unpriced_requests),
        currency: 'USD',
      },
      reservations: {
        total: number(row?.total_reservations),
        recent: number(row?.recent_reservations),
        recentRevenue: Number(number(row?.reservation_revenue).toFixed(2)),
        currency: 'USD',
      },
      recentFailures: number(row?.recent_failures),
      queueHealth: {
        status: queueHealth.status,
        queues: queueHealth.summary,
      },
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
    const rows = await this.repository.getAiCosts(range);
    const totals = rows.reduce((result, row) => ({
      estimatedCost: result.estimatedCost + money(row.estimated_cost),
      pricedRequests: result.pricedRequests + number(row.priced_requests),
      unpricedRequests: result.unpricedRequests + number(row.unpriced_requests),
    }), { estimatedCost: 0, pricedRequests: 0, unpricedRequests: 0 });

    return {
      range: { ...range, timezone: 'UTC' },
      currency: 'USD',
      costType: 'estimated',
      totals: {
        ...totals,
        estimatedCost: money(totals.estimatedCost),
      },
      byFeature: rows.map((row) => ({
        feature: row.feature,
        estimatedCost: money(row.estimated_cost),
        pricedRequests: number(row.priced_requests),
        unpricedRequests: number(row.unpriced_requests),
      })),
    };
  }

  async getReservations(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getReservations(pagination);
    return paginated(rows, pagination, mapReservation);
  }

  mapQueueHealth(rows) {
    const queues = (Array.isArray(rows) ? rows : []).map((row) => {
      const counts = row.counts
        ? Object.fromEntries(Object.entries(row.counts).map(([key, value]) => [key, number(value)]))
        : null;
      const status = !row.available ? 'unavailable' : number(counts?.failed) > 0 ? 'attention' : 'healthy';

      return {
        name: row.name,
        status,
        counts,
      };
    });

    const unavailable = queues.filter((queue) => queue.status === 'unavailable').length;
    const attention = queues.filter((queue) => queue.status === 'attention').length;
    const status = queues.length === 0 || unavailable > 0
      ? 'degraded'
      : attention > 0 ? 'attention' : 'healthy';

    return {
      status,
      summary: {
        registered: queues.length,
        unavailable,
        attention,
      },
      queues,
    };
  }

  async getQueueHealth() {
    const rows = await this.repository.getQueueHealth();
    return {
      observedAt: this.clock().toISOString(),
      ...this.mapQueueHealth(rows),
    };
  }

  async getFailures(query) {
    const pagination = normalizePagination(query);
    const rows = await this.repository.getFailures(pagination);
    return paginated(rows, pagination, mapFailure);
  }
}

export {
  AdminService,
  MAX_PAGE_SIZE,
  normalizePagination,
  normalizeRange,
};
export default new AdminService();
