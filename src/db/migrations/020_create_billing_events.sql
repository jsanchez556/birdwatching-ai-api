CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('Stripe', 'TiloPay', 'BAC', 'Other')),
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'checkout_completed',
      'subscription_created',
      'subscription_updated',
      'subscription_cancelled',
      'subscription_renewed',
      'payment_failed'
    )
  ),
  provider_object_id TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_invoice_id TEXT,
  status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider_subscription
ON billing_events(provider, provider_subscription_id, created_at DESC)
WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_name_created_at
ON billing_events(event_name, created_at DESC);

DROP TRIGGER IF EXISTS billing_events_set_updated_at ON billing_events;
CREATE TRIGGER billing_events_set_updated_at
BEFORE UPDATE ON billing_events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION record_billing_provider_event(
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_event_name TEXT,
  p_provider_object_id TEXT DEFAULT NULL,
  p_provider_customer_id TEXT DEFAULT NULL,
  p_provider_subscription_id TEXT DEFAULT NULL,
  p_provider_invoice_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  provider TEXT,
  provider_event_id TEXT,
  event_type TEXT,
  event_name TEXT,
  provider_object_id TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_invoice_id TEXT,
  status TEXT,
  event_data JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  inserted BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH inserted_event AS (
    INSERT INTO billing_events (
      provider,
      provider_event_id,
      event_type,
      event_name,
      provider_object_id,
      provider_customer_id,
      provider_subscription_id,
      provider_invoice_id,
      status,
      event_data
    )
    VALUES (
      p_provider,
      p_provider_event_id,
      p_event_type,
      p_event_name,
      p_provider_object_id,
      p_provider_customer_id,
      p_provider_subscription_id,
      p_provider_invoice_id,
      p_status,
      COALESCE(p_event_data, '{}'::jsonb)
    )
    ON CONFLICT ON CONSTRAINT billing_events_provider_provider_event_id_key DO NOTHING
    RETURNING billing_events.*, TRUE AS inserted
  ),
  existing_event AS (
    SELECT billing_events.*, FALSE AS inserted
    FROM billing_events
    WHERE billing_events.provider = p_provider
      AND billing_events.provider_event_id = p_provider_event_id
      AND NOT EXISTS (SELECT 1 FROM inserted_event)
    LIMIT 1
  )
  SELECT
    event_row.id,
    event_row.provider,
    event_row.provider_event_id,
    event_row.event_type,
    event_row.event_name,
    event_row.provider_object_id,
    event_row.provider_customer_id,
    event_row.provider_subscription_id,
    event_row.provider_invoice_id,
    event_row.status,
    event_row.event_data,
    event_row.processed_at,
    event_row.created_at,
    event_row.inserted
  FROM (
    SELECT * FROM inserted_event
    UNION ALL
    SELECT * FROM existing_event
  ) AS event_row
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_billing_provider_event_processed(
  p_provider TEXT,
  p_provider_event_id TEXT
)
RETURNS TABLE (
  id BIGINT,
  provider TEXT,
  provider_event_id TEXT,
  event_type TEXT,
  event_name TEXT,
  provider_object_id TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_invoice_id TEXT,
  status TEXT,
  event_data JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_events
  SET processed_at = COALESCE(billing_events.processed_at, NOW())
  WHERE billing_events.provider = p_provider
    AND billing_events.provider_event_id = p_provider_event_id
  RETURNING
    billing_events.id,
    billing_events.provider,
    billing_events.provider_event_id,
    billing_events.event_type,
    billing_events.event_name,
    billing_events.provider_object_id,
    billing_events.provider_customer_id,
    billing_events.provider_subscription_id,
    billing_events.provider_invoice_id,
    billing_events.status,
    billing_events.event_data,
    billing_events.processed_at,
    billing_events.created_at;
END;
$$ LANGUAGE plpgsql;
