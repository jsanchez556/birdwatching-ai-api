import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const {
  default: billingEventQueries,
  mapBillingEvent,
} = await import('../src/db/queries/billingEvent.queries.js');

describe('BillingEventQueries provider event persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps billing provider events into provider-neutral fields', () => {
    expect(mapBillingEvent({
      id: '1',
      provider: 'Stripe',
      provider_event_id: 'evt_123',
      event_type: 'customer.subscription.updated',
      event_name: 'subscription_updated',
      provider_object_id: 'sub_123',
      provider_customer_id: 'cus_123',
      provider_subscription_id: 'sub_123',
      provider_invoice_id: null,
      status: 'active',
      event_data: { providerStatus: 'active' },
      processed_at: '2026-07-08T00:00:00.000Z',
      created_at: '2026-07-08T00:00:00.000Z',
      inserted: true,
    })).toEqual({
      id: '1',
      provider: 'Stripe',
      providerEventId: 'evt_123',
      eventType: 'customer.subscription.updated',
      eventName: 'subscription_updated',
      providerObjectId: 'sub_123',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerInvoiceId: null,
      status: 'active',
      eventData: { providerStatus: 'active' },
      processedAt: '2026-07-08T00:00:00.000Z',
      createdAt: '2026-07-08T00:00:00.000Z',
      inserted: true,
    });
  });

  it('records provider events through the database idempotency function', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider: 'Stripe',
          provider_event_id: 'evt_invoice_failed',
          event_name: 'payment_failed',
          inserted: false,
        },
      ],
    });

    await expect(billingEventQueries.recordProviderEvent({
      provider: 'Stripe',
      providerEventId: 'evt_invoice_failed',
      eventType: 'invoice.payment_failed',
      eventName: 'payment_failed',
      providerObjectId: 'in_123',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      providerInvoiceId: 'in_123',
      status: 'open',
      eventData: {
        amountDue: 2500,
      },
    })).resolves.toMatchObject({
      provider: 'Stripe',
      providerEventId: 'evt_invoice_failed',
      eventName: 'payment_failed',
      inserted: false,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM record_billing_provider_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        'Stripe',
        'evt_invoice_failed',
        'invoice.payment_failed',
        'payment_failed',
        'in_123',
        'cus_123',
        'sub_123',
        'in_123',
        'open',
        JSON.stringify({ amountDue: 2500 }),
      ]
    );
  });

  it('marks provider events processed after side effects complete', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider: 'Stripe',
          provider_event_id: 'evt_123',
          processed_at: '2026-07-08T00:00:00.000Z',
        },
      ],
    });

    await expect(billingEventQueries.markProviderEventProcessed({
      provider: 'Stripe',
      providerEventId: 'evt_123',
    })).resolves.toMatchObject({
      provider: 'Stripe',
      providerEventId: 'evt_123',
      processedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM mark_billing_provider_event_processed($1, $2)',
      ['Stripe', 'evt_123']
    );
  });
});
