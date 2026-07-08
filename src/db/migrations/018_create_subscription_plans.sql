CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  max_chats INTEGER NOT NULL CHECK (max_chats >= 0),
  max_identifications INTEGER NOT NULL CHECK (max_identifications >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  billing_provider TEXT CHECK (billing_provider IS NULL OR billing_provider IN ('Stripe', 'TiloPay', 'BAC', 'Other')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_price_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_provider_customer
ON user_subscriptions(billing_provider, provider_customer_id)
WHERE billing_provider IS NOT NULL
  AND provider_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_provider_subscription
ON user_subscriptions(billing_provider, provider_subscription_id)
WHERE billing_provider IS NOT NULL
  AND provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_mappings (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('Stripe', 'TiloPay', 'BAC', 'Other')),
  provider_product_id TEXT,
  provider_price_id TEXT,
  provider_sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_product_id, provider_price_id, provider_sku)
);

CREATE INDEX IF NOT EXISTS idx_provider_mappings_lookup
ON provider_mappings(provider, provider_price_id, provider_product_id, provider_sku);

CREATE TABLE IF NOT EXISTS plan_provider_mappings (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  provider_mapping_id INTEGER NOT NULL REFERENCES provider_mappings(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, provider_mapping_id)
);

CREATE TABLE IF NOT EXISTS tour_provider_mappings (
  tour_id INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  provider_mapping_id INTEGER NOT NULL REFERENCES provider_mappings(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tour_id, provider_mapping_id)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('chat', 'identification', 'embedding', 'voice', 'image_analysis')),
  tokens INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  estimated_cost NUMERIC(12, 6),
  trace_id TEXT,
  model_usage JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_feature_created_at
ON usage_events(user_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created_at
ON usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_trace_id
ON usage_events(trace_id)
WHERE trace_id IS NOT NULL;

INSERT INTO plans (name, max_chats, max_identifications)
VALUES
  ('FREE', 20, 5),
  ('PRO', 500, 100),
  ('GUIDE', 1200, 300)
ON CONFLICT (name) DO UPDATE
SET
  max_chats = EXCLUDED.max_chats,
  max_identifications = EXCLUDED.max_identifications,
  updated_at = NOW();

INSERT INTO user_subscriptions (user_id, plan_id, status)
SELECT users.id, plans.id, 'active'
FROM users
CROSS JOIN plans
WHERE plans.name = 'FREE'
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS plans_set_updated_at ON plans;
CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON plans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_subscriptions_set_updated_at ON user_subscriptions;
CREATE TRIGGER user_subscriptions_set_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS provider_mappings_set_updated_at ON provider_mappings;
CREATE TRIGGER provider_mappings_set_updated_at
BEFORE UPDATE ON provider_mappings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION assert_single_default_plan_provider_mapping()
RETURNS TRIGGER AS $$
DECLARE
  mapping_provider TEXT;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT provider_mappings.provider
  INTO mapping_provider
  FROM provider_mappings
  WHERE provider_mappings.id = NEW.provider_mapping_id;

  IF EXISTS (
    SELECT 1
    FROM plan_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
    WHERE plan_provider_mappings.plan_id = NEW.plan_id
      AND provider_mappings.provider = mapping_provider
      AND plan_provider_mappings.is_default = TRUE
      AND plan_provider_mappings.provider_mapping_id <> NEW.provider_mapping_id
  ) THEN
    RAISE EXCEPTION 'Default provider mapping already exists for plan/provider';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assert_single_default_tour_provider_mapping()
RETURNS TRIGGER AS $$
DECLARE
  mapping_provider TEXT;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT provider_mappings.provider
  INTO mapping_provider
  FROM provider_mappings
  WHERE provider_mappings.id = NEW.provider_mapping_id;

  IF EXISTS (
    SELECT 1
    FROM tour_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = tour_provider_mappings.provider_mapping_id
    WHERE tour_provider_mappings.tour_id = NEW.tour_id
      AND provider_mappings.provider = mapping_provider
      AND tour_provider_mappings.is_default = TRUE
      AND tour_provider_mappings.provider_mapping_id <> NEW.provider_mapping_id
  ) THEN
    RAISE EXCEPTION 'Default provider mapping already exists for tour/provider';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_provider_mappings_single_default ON plan_provider_mappings;
CREATE TRIGGER plan_provider_mappings_single_default
BEFORE INSERT OR UPDATE OF is_default, provider_mapping_id, plan_id ON plan_provider_mappings
FOR EACH ROW
EXECUTE FUNCTION assert_single_default_plan_provider_mapping();

DROP TRIGGER IF EXISTS plan_provider_mappings_set_updated_at ON plan_provider_mappings;
CREATE TRIGGER plan_provider_mappings_set_updated_at
BEFORE UPDATE ON plan_provider_mappings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tour_provider_mappings_single_default ON tour_provider_mappings;
CREATE TRIGGER tour_provider_mappings_single_default
BEFORE INSERT OR UPDATE OF is_default, provider_mapping_id, tour_id ON tour_provider_mappings
FOR EACH ROW
EXECUTE FUNCTION assert_single_default_tour_provider_mapping();

DROP TRIGGER IF EXISTS tour_provider_mappings_set_updated_at ON tour_provider_mappings;
CREATE TRIGGER tour_provider_mappings_set_updated_at
BEFORE UPDATE ON tour_provider_mappings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION get_default_plan_provider_mapping(
  p_plan_name TEXT,
  p_provider TEXT
)
RETURNS TABLE (
  provider_mapping_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  provider TEXT,
  provider_product_id TEXT,
  provider_price_id TEXT,
  provider_sku TEXT,
  is_default BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    provider_mappings.id,
    plans.id,
    plans.name,
    provider_mappings.provider,
    provider_mappings.provider_product_id,
    provider_mappings.provider_price_id,
    provider_mappings.provider_sku,
    plan_provider_mappings.is_default
  FROM plan_provider_mappings
  INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
  INNER JOIN plans ON plans.id = plan_provider_mappings.plan_id
  WHERE plans.name = p_plan_name
    AND provider_mappings.provider = p_provider
    AND plan_provider_mappings.is_default = TRUE
  ORDER BY plan_provider_mappings.provider_mapping_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_default_tour_provider_mapping(
  p_tour_id INTEGER,
  p_provider TEXT
)
RETURNS TABLE (
  provider_mapping_id INTEGER,
  tour_id INTEGER,
  tour_name TEXT,
  provider TEXT,
  provider_product_id TEXT,
  provider_price_id TEXT,
  provider_sku TEXT,
  is_default BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    provider_mappings.id,
    tours.id,
    tours.name,
    provider_mappings.provider,
    provider_mappings.provider_product_id,
    provider_mappings.provider_price_id,
    provider_mappings.provider_sku,
    tour_provider_mappings.is_default
  FROM tour_provider_mappings
  INNER JOIN provider_mappings ON provider_mappings.id = tour_provider_mappings.provider_mapping_id
  INNER JOIN tours ON tours.id = tour_provider_mappings.tour_id
  WHERE tours.id = p_tour_id
    AND provider_mappings.provider = p_provider
    AND tour_provider_mappings.is_default = TRUE
  ORDER BY tour_provider_mappings.provider_mapping_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_free_user_subscription(p_user_id INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO user_subscriptions (user_id, plan_id, status)
  SELECT p_user_id, plans.id, 'active'
  FROM plans
  WHERE plans.name = 'FREE'
  ON CONFLICT ON CONSTRAINT user_subscriptions_pkey DO UPDATE
  SET
    plan_id = COALESCE(user_subscriptions.plan_id, EXCLUDED.plan_id),
    status = COALESCE(user_subscriptions.status, EXCLUDED.status)
  RETURNING
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    (SELECT plans.name FROM plans WHERE plans.id = user_subscriptions.plan_id),
    user_subscriptions.status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_subscription_plan(p_user_id INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  status TEXT,
  max_chats INTEGER,
  max_identifications INTEGER,
  billing_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_price_id TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    user_subscriptions.user_id,
    plans.id,
    plans.name,
    user_subscriptions.status,
    plans.max_chats,
    plans.max_identifications,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end
  FROM user_subscriptions
  INNER JOIN plans ON plans.id = user_subscriptions.plan_id
  WHERE user_subscriptions.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upsert_provider_subscription(
  p_user_id INTEGER,
  p_plan_name TEXT,
  p_status TEXT,
  p_billing_provider TEXT,
  p_provider_customer_id TEXT,
  p_provider_subscription_id TEXT,
  p_provider_price_id TEXT,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  status TEXT,
  billing_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_price_id TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
DECLARE
  target_plan_id INTEGER;
BEGIN
  SELECT plans.id
  INTO target_plan_id
  FROM plans
  WHERE plans.name = p_plan_name
  LIMIT 1;

  IF target_plan_id IS NULL THEN
    RAISE EXCEPTION 'Unknown plan: %', p_plan_name;
  END IF;

  RETURN QUERY
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    billing_provider,
    provider_customer_id,
    provider_subscription_id,
    provider_price_id,
    current_period_end
  )
  VALUES (
    p_user_id,
    target_plan_id,
    COALESCE(p_status, 'active'),
    p_billing_provider,
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_price_id,
    p_current_period_end
  )
  ON CONFLICT ON CONSTRAINT user_subscriptions_pkey DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    billing_provider = COALESCE(EXCLUDED.billing_provider, user_subscriptions.billing_provider),
    provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, user_subscriptions.provider_customer_id),
    provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, user_subscriptions.provider_subscription_id),
    provider_price_id = COALESCE(EXCLUDED.provider_price_id, user_subscriptions.provider_price_id),
    current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end)
  RETURNING
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    (SELECT plans.name FROM plans WHERE plans.id = user_subscriptions.plan_id),
    user_subscriptions.status,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_provider_subscription_status(
  p_billing_provider TEXT,
  p_provider_subscription_id TEXT,
  p_status TEXT,
  p_provider_price_id TEXT,
  p_plan_name TEXT DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  status TEXT,
  billing_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_price_id TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
DECLARE
  target_plan_name TEXT := 'FREE';
  target_plan_id INTEGER;
BEGIN
  IF p_status IN ('active', 'trialing', 'past_due') THEN
    SELECT plans.name
    INTO target_plan_name
    FROM plan_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
    INNER JOIN plans ON plans.id = plan_provider_mappings.plan_id
    WHERE provider_mappings.provider = p_billing_provider
      AND provider_mappings.provider_price_id = p_provider_price_id
    ORDER BY plan_provider_mappings.is_default DESC, plan_provider_mappings.provider_mapping_id
    LIMIT 1;

    target_plan_name := COALESCE(NULLIF(UPPER(TRIM(p_plan_name)), ''), target_plan_name, 'PRO');
  END IF;

  SELECT plans.id
  INTO target_plan_id
  FROM plans
  WHERE plans.name = target_plan_name
  LIMIT 1;

  RETURN QUERY
  UPDATE user_subscriptions
  SET
    plan_id = target_plan_id,
    status = CASE
      WHEN p_status = 'trialing' THEN 'trialing'
      WHEN p_status = 'active' THEN 'active'
      WHEN p_status = 'past_due' THEN 'past_due'
      WHEN p_status IN ('canceled', 'cancelled') THEN 'cancelled'
      ELSE 'expired'
    END,
    provider_price_id = COALESCE(p_provider_price_id, user_subscriptions.provider_price_id),
    current_period_end = COALESCE(p_current_period_end, user_subscriptions.current_period_end)
  WHERE user_subscriptions.billing_provider = p_billing_provider
    AND user_subscriptions.provider_subscription_id = p_provider_subscription_id
  RETURNING
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    (SELECT plans.name FROM plans WHERE plans.id = user_subscriptions.plan_id),
    user_subscriptions.status,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_daily_usage(
  p_user_id INTEGER,
  p_feature TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  usage_event_id BIGINT,
  plan_name TEXT,
  feature TEXT,
  used INTEGER,
  max_allowed INTEGER
) AS $$
DECLARE
  subscription RECORD;
  free_plan RECORD;
  current_used INTEGER;
  feature_limit INTEGER;
  reserved_usage_event_id BIGINT;
BEGIN
  IF p_feature NOT IN ('chat', 'identification') THEN
    RAISE EXCEPTION 'Unsupported quota feature: %', p_feature;
  END IF;

  PERFORM pg_advisory_xact_lock(
    p_user_id,
    CASE WHEN p_feature = 'chat' THEN 1 ELSE 2 END
  );

  SELECT *
  INTO subscription
  FROM get_user_subscription_plan(p_user_id);

  IF subscription.user_id IS NULL THEN
    SELECT *
    INTO subscription
    FROM ensure_free_user_subscription(p_user_id);

    SELECT *
    INTO subscription
    FROM get_user_subscription_plan(p_user_id);
  END IF;

  IF subscription.status NOT IN ('active', 'trialing', 'past_due') THEN
    SELECT plans.name, plans.max_chats, plans.max_identifications
    INTO free_plan
    FROM plans
    WHERE plans.name = 'FREE'
    LIMIT 1;

    subscription.plan_name := free_plan.name;
    subscription.max_chats := free_plan.max_chats;
    subscription.max_identifications := free_plan.max_identifications;
  END IF;

  feature_limit := CASE
    WHEN p_feature = 'chat' THEN subscription.max_chats
    ELSE subscription.max_identifications
  END;

  SELECT COUNT(*)::INTEGER
  INTO current_used
  FROM usage_events
  WHERE usage_events.user_id = p_user_id
    AND usage_events.feature = p_feature
    AND usage_events.created_at >= date_trunc('day', NOW());

  IF current_used >= feature_limit THEN
    RETURN QUERY SELECT FALSE, NULL::BIGINT, subscription.plan_name, p_feature, current_used, feature_limit;
    RETURN;
  END IF;

  INSERT INTO usage_events (user_id, feature)
  VALUES (p_user_id, p_feature)
  RETURNING id INTO reserved_usage_event_id;

  RETURN QUERY SELECT TRUE, reserved_usage_event_id, subscription.plan_name, p_feature, current_used + 1, feature_limit;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_usage_event_cost(
  p_usage_event_id BIGINT,
  p_user_id INTEGER,
  p_tokens INTEGER DEFAULT 0,
  p_estimated_cost NUMERIC DEFAULT NULL,
  p_trace_id TEXT DEFAULT NULL,
  p_model_usage JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  user_id INTEGER,
  feature TEXT,
  tokens INTEGER,
  estimated_cost NUMERIC,
  trace_id TEXT,
  model_usage JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE usage_events
  SET
    tokens = GREATEST(COALESCE(p_tokens, 0), 0),
    estimated_cost = p_estimated_cost,
    trace_id = COALESCE(p_trace_id, usage_events.trace_id),
    model_usage = COALESCE(p_model_usage, usage_events.model_usage, '[]'::jsonb)
  WHERE usage_events.id = p_usage_event_id
    AND usage_events.user_id = p_user_id
  RETURNING
    usage_events.id,
    usage_events.user_id,
    usage_events.feature,
    usage_events.tokens,
    usage_events.estimated_cost,
    usage_events.trace_id,
    usage_events.model_usage,
    usage_events.created_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_usage_event(
  p_user_id INTEGER,
  p_feature TEXT,
  p_tokens INTEGER DEFAULT 0,
  p_estimated_cost NUMERIC DEFAULT NULL,
  p_trace_id TEXT DEFAULT NULL,
  p_model_usage JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  user_id INTEGER,
  feature TEXT,
  tokens INTEGER,
  estimated_cost NUMERIC,
  trace_id TEXT,
  model_usage JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO usage_events (
    user_id,
    feature,
    tokens,
    estimated_cost,
    trace_id,
    model_usage
  )
  VALUES (
    p_user_id,
    p_feature,
    GREATEST(COALESCE(p_tokens, 0), 0),
    p_estimated_cost,
    p_trace_id,
    COALESCE(p_model_usage, '[]'::jsonb)
  )
  RETURNING
    usage_events.id,
    usage_events.user_id,
    usage_events.feature,
    usage_events.tokens,
    usage_events.estimated_cost,
    usage_events.trace_id,
    usage_events.model_usage,
    usage_events.created_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_monthly_usage_dashboard(
  p_user_id INTEGER,
  p_month_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW())
)
RETURNS TABLE (
  monthly_cost NUMERIC,
  monthly_requests INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC,
    COUNT(*)::INTEGER
  FROM usage_events
  WHERE usage_events.user_id = p_user_id
    AND usage_events.created_at >= p_month_start
    AND usage_events.created_at < p_month_start + INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;
