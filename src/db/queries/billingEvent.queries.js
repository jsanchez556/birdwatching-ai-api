import pool from '../pool.js';

function mapBillingEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    eventName: row.event_name,
    providerObjectId: row.provider_object_id,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerInvoiceId: row.provider_invoice_id,
    status: row.status,
    eventData: row.event_data,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    inserted: row.inserted,
  };
}

class BillingEventQueries {
  async recordProviderEvent({
    provider,
    providerEventId,
    eventType,
    eventName,
    providerObjectId = null,
    providerCustomerId = null,
    providerSubscriptionId = null,
    providerInvoiceId = null,
    status = null,
    eventData = {},
  }) {
    const result = await pool.query(
      'SELECT * FROM record_billing_provider_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        provider,
        providerEventId,
        eventType,
        eventName,
        providerObjectId,
        providerCustomerId,
        providerSubscriptionId,
        providerInvoiceId,
        status,
        JSON.stringify(eventData || {}),
      ]
    );

    return mapBillingEvent(result.rows[0]);
  }

  async markProviderEventProcessed({ provider, providerEventId }) {
    const result = await pool.query(
      'SELECT * FROM mark_billing_provider_event_processed($1, $2)',
      [provider, providerEventId]
    );

    return mapBillingEvent(result.rows[0]);
  }
}

export { BillingEventQueries, mapBillingEvent };
export default new BillingEventQueries();
