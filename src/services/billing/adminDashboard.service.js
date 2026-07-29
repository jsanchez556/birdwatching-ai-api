import billingDashboardQueries from '../../db/queries/billingDashboard.queries.js';
import HttpError from '../../utils/httpError.js';

function normalizeMoney(value, decimals = 2) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Number(normalized.toFixed(decimals)) : 0;
}

function normalizePlanRevenue(value = []) {
  const rows = Array.isArray(value) ? value : [];

  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      plan: typeof row.plan === 'string' && row.plan.trim() ? row.plan.trim() : 'UNKNOWN',
      monthlyRevenue: normalizeMoney(row.monthlyRevenue, 2),
      activeSubscriptions: Number(row.activeSubscriptions || 0),
    }));
}

function normalizeMonthStart(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, 'Invalid billing dashboard filters', {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'monthStart', message: 'monthStart must be an ISO date string.' }],
    });
  }

  const normalized = new Date(value);

  if (Number.isNaN(normalized.getTime())) {
    throw new HttpError(422, 'Invalid billing dashboard filters', {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'monthStart', message: 'monthStart must be a valid ISO date string.' }],
    });
  }

  return normalized.toISOString();
}

function mapAdminBillingDashboard(row = {}) {
  const monthlyRevenue = normalizeMoney(row?.monthly_revenue, 2);

  return {
    monthlyRevenue,
    mrr: normalizeMoney(row?.mrr ?? monthlyRevenue, 2),
    arr: normalizeMoney(row?.arr, 2),
    activeSubscriptions: Number(row?.active_subscriptions || 0),
    cancelledSubscriptions: Number(row?.cancelled_subscriptions || 0),
    revenueByPlan: normalizePlanRevenue(row?.revenue_by_plan),
  };
}

class AdminBillingDashboardService {
  async getDashboard({ monthStart = null } = {}) {
    const row = await billingDashboardQueries.getAdminDashboard({
      monthStart: normalizeMonthStart(monthStart),
    });

    return mapAdminBillingDashboard(row);
  }
}

export {
  AdminBillingDashboardService,
  mapAdminBillingDashboard,
  normalizeMonthStart,
  normalizePlanRevenue,
};
export default new AdminBillingDashboardService();
