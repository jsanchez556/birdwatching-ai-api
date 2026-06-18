import pool from '../pool.js';

function mapPlan(row) {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    planId: row.plan_id,
    name: row.plan_name,
    status: row.status,
    maxChats: row.max_chats,
    maxIdentifications: row.max_identifications,
    billingProvider: row.billing_provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerPriceId: row.provider_price_id,
    currentPeriodEnd: row.current_period_end,
  };
}

class PlanQueries {
  async getUserPlan(userId) {
    const result = await pool.query(
      'SELECT * FROM get_user_subscription_plan($1)',
      [userId]
    );

    return mapPlan(result.rows[0]);
  }

  async ensureFreeSubscription(userId) {
    const result = await pool.query(
      'SELECT * FROM ensure_free_user_subscription($1)',
      [userId]
    );

    return mapPlan(result.rows[0]);
  }

  async upsertProviderSubscription({
    userId,
    planName,
    status,
    billingProvider,
    providerCustomerId,
    providerSubscriptionId,
    providerPriceId,
    currentPeriodEnd,
  }) {
    const result = await pool.query(
      'SELECT * FROM upsert_provider_subscription($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        userId,
        planName,
        status,
        billingProvider,
        providerCustomerId,
        providerSubscriptionId,
        providerPriceId,
        currentPeriodEnd,
      ]
    );

    return mapPlan(result.rows[0]);
  }

  async updateProviderSubscriptionStatus({
    billingProvider,
    providerSubscriptionId,
    status,
    providerPriceId,
    currentPeriodEnd,
  }) {
    const result = await pool.query(
      'SELECT * FROM update_provider_subscription_status($1, $2, $3, $4, $5)',
      [
        billingProvider,
        providerSubscriptionId,
        status,
        providerPriceId,
        currentPeriodEnd,
      ]
    );

    return mapPlan(result.rows[0]);
  }
}

export { PlanQueries, mapPlan };
export default new PlanQueries();
