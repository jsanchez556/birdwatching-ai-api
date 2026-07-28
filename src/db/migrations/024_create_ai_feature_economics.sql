CREATE OR REPLACE FUNCTION get_ai_feature_economics(
  p_granularity TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS TABLE (
  bucket_start TIMESTAMPTZ,
  feature TEXT,
  feature_usage BIGINT,
  tokens BIGINT,
  ai_cost NUMERIC,
  allocated_subscription_revenue NUMERIC,
  subscription_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_date_part TEXT;
  v_step INTERVAL;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  IF p_granularity = 'daily' THEN
    v_date_part := 'day';
    v_step := INTERVAL '1 day';
  ELSIF p_granularity = 'monthly' THEN
    v_date_part := 'month';
    v_step := INTERVAL '1 month';
  ELSE
    RAISE EXCEPTION 'Unsupported feature economics granularity';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Feature economics end must be after start';
  END IF;

  v_start_at := date_trunc(v_date_part, p_start_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_end_at := date_trunc(v_date_part, p_end_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  IF p_end_at > v_end_at THEN
    v_end_at := v_end_at + v_step;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      v_start_at,
      v_end_at - v_step,
      v_step
    ) AS bucket_start
  ),
  usage_by_user_feature AS (
    SELECT
      date_trunc(v_date_part, usage_events.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
      usage_events.user_id,
      usage_events.feature,
      COUNT(*)::BIGINT AS feature_usage,
      COALESCE(SUM(usage_events.tokens), 0)::BIGINT AS tokens,
      COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC AS ai_cost
    FROM usage_events
    WHERE usage_events.created_at >= p_start_at
      AND usage_events.created_at < p_end_at
    GROUP BY 1, usage_events.user_id, usage_events.feature
  ),
  usage_by_user AS (
    SELECT
      usage_by_user_feature.bucket_start,
      usage_by_user_feature.user_id,
      SUM(usage_by_user_feature.feature_usage)::NUMERIC AS total_usage
    FROM usage_by_user_feature
    GROUP BY usage_by_user_feature.bucket_start, usage_by_user_feature.user_id
  ),
  revenue_by_user AS (
    SELECT
      date_trunc(v_date_part, billing_events.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
      user_subscriptions.user_id,
      COALESCE(
        SUM(COALESCE(NULLIF(billing_events.event_data->>'amountPaid', '')::NUMERIC, 0) / 100),
        0
      )::NUMERIC AS subscription_revenue
    FROM billing_events
    INNER JOIN user_subscriptions
      ON user_subscriptions.billing_provider = billing_events.provider
      AND user_subscriptions.provider_subscription_id = billing_events.provider_subscription_id
    WHERE billing_events.event_name = 'subscription_renewed'
      AND billing_events.created_at >= p_start_at
      AND billing_events.created_at < p_end_at
    GROUP BY 1, user_subscriptions.user_id
  ),
  feature_economics AS (
    SELECT
      usage_by_user_feature.bucket_start,
      usage_by_user_feature.feature,
      SUM(usage_by_user_feature.feature_usage)::BIGINT AS feature_usage,
      SUM(usage_by_user_feature.tokens)::BIGINT AS tokens,
      SUM(usage_by_user_feature.ai_cost)::NUMERIC AS ai_cost,
      SUM(
        COALESCE(revenue_by_user.subscription_revenue, 0)
        * usage_by_user_feature.feature_usage
        / NULLIF(usage_by_user.total_usage, 0)
      )::NUMERIC AS allocated_subscription_revenue
    FROM usage_by_user_feature
    INNER JOIN usage_by_user
      ON usage_by_user.bucket_start = usage_by_user_feature.bucket_start
      AND usage_by_user.user_id = usage_by_user_feature.user_id
    LEFT JOIN revenue_by_user
      ON revenue_by_user.bucket_start = usage_by_user_feature.bucket_start
      AND revenue_by_user.user_id = usage_by_user_feature.user_id
    GROUP BY usage_by_user_feature.bucket_start, usage_by_user_feature.feature
  ),
  revenue_by_bucket AS (
    SELECT
      revenue_by_user.bucket_start,
      SUM(revenue_by_user.subscription_revenue)::NUMERIC AS subscription_revenue
    FROM revenue_by_user
    GROUP BY revenue_by_user.bucket_start
  )
  SELECT
    buckets.bucket_start,
    feature_economics.feature::TEXT,
    COALESCE(feature_economics.feature_usage, 0)::BIGINT,
    COALESCE(feature_economics.tokens, 0)::BIGINT,
    COALESCE(feature_economics.ai_cost, 0)::NUMERIC,
    COALESCE(feature_economics.allocated_subscription_revenue, 0)::NUMERIC,
    COALESCE(revenue_by_bucket.subscription_revenue, 0)::NUMERIC
  FROM buckets
  LEFT JOIN feature_economics
    ON feature_economics.bucket_start = buckets.bucket_start
  LEFT JOIN revenue_by_bucket
    ON revenue_by_bucket.bucket_start = buckets.bucket_start
  ORDER BY buckets.bucket_start, feature_economics.feature;
END;
$$;
