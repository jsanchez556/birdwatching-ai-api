CREATE OR REPLACE FUNCTION get_monthly_billing_usage_dashboard(
  p_user_id INTEGER,
  p_month_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW())
)
RETURNS TABLE (
  monthly_cost NUMERIC,
  monthly_requests INTEGER,
  monthly_tokens INTEGER,
  plan_name TEXT,
  subscription_status TEXT,
  billing_provider TEXT,
  has_provider_subscription BOOLEAN,
  provider_revenue NUMERIC,
  gross_profit NUMERIC,
  gross_margin_percent NUMERIC,
  langsmith_trace_count INTEGER,
  usage_by_feature JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH subscription AS (
    SELECT
      plans.name::TEXT AS plan_name,
      user_subscriptions.status::TEXT AS status,
      user_subscriptions.billing_provider::TEXT AS billing_provider,
      user_subscriptions.provider_subscription_id
    FROM user_subscriptions
    INNER JOIN plans ON plans.id = user_subscriptions.plan_id
    WHERE user_subscriptions.user_id = p_user_id
    LIMIT 1
  ),
  usage_summary AS (
    SELECT
      COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC AS monthly_cost,
      COUNT(*)::INTEGER AS monthly_requests,
      COALESCE(SUM(usage_events.tokens), 0)::INTEGER AS monthly_tokens,
      COUNT(DISTINCT usage_events.trace_id) FILTER (WHERE usage_events.trace_id IS NOT NULL)::INTEGER AS trace_count
    FROM usage_events
    WHERE usage_events.user_id = p_user_id
      AND usage_events.created_at >= p_month_start
      AND usage_events.created_at < p_month_start + INTERVAL '1 month'
  ),
  usage_features AS (
    SELECT
      usage_events.feature,
      COUNT(*)::INTEGER AS requests,
      COALESCE(SUM(usage_events.tokens), 0)::INTEGER AS tokens,
      COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC AS cost
    FROM usage_events
    WHERE usage_events.user_id = p_user_id
      AND usage_events.created_at >= p_month_start
      AND usage_events.created_at < p_month_start + INTERVAL '1 month'
    GROUP BY usage_events.feature
  ),
  usage_feature_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'feature', usage_features.feature,
          'requests', usage_features.requests,
          'tokens', usage_features.tokens,
          'cost', usage_features.cost
        )
        ORDER BY usage_features.feature
      ),
      '[]'::jsonb
    ) AS usage_by_feature
    FROM usage_features
  ),
  provider_revenue AS (
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN billing_events.event_name = 'subscription_renewed'
              THEN COALESCE(NULLIF(billing_events.event_data->>'amountPaid', '')::NUMERIC, 0) / 100
            ELSE 0
          END
        ),
        0
      )::NUMERIC AS revenue
    FROM billing_events
    CROSS JOIN subscription
    WHERE billing_events.provider = subscription.billing_provider
      AND billing_events.provider_subscription_id = subscription.provider_subscription_id
      AND billing_events.created_at >= p_month_start
      AND billing_events.created_at < p_month_start + INTERVAL '1 month'
  )
  SELECT
    usage_summary.monthly_cost,
    usage_summary.monthly_requests,
    usage_summary.monthly_tokens,
    COALESCE(subscription.plan_name, 'FREE')::TEXT,
    COALESCE(subscription.status, 'active')::TEXT,
    subscription.billing_provider,
    subscription.provider_subscription_id IS NOT NULL,
    provider_revenue.revenue,
    provider_revenue.revenue - usage_summary.monthly_cost,
    CASE
      WHEN provider_revenue.revenue > 0
        THEN ROUND(((provider_revenue.revenue - usage_summary.monthly_cost) / provider_revenue.revenue) * 100, 2)
      ELSE NULL
    END,
    usage_summary.trace_count,
    usage_feature_json.usage_by_feature
  FROM usage_summary
  CROSS JOIN usage_feature_json
  LEFT JOIN subscription ON TRUE
  CROSS JOIN provider_revenue;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_admin_billing_dashboard(
  p_month_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW())
)
RETURNS TABLE (
  monthly_revenue NUMERIC,
  mrr NUMERIC,
  arr NUMERIC,
  active_subscriptions INTEGER,
  cancelled_subscriptions INTEGER,
  revenue_by_plan JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH active_plan_counts AS (
    SELECT
      plans.name::TEXT AS plan_name,
      COUNT(*) FILTER (WHERE user_subscriptions.status = 'active')::INTEGER AS active_count
    FROM plans
    LEFT JOIN user_subscriptions ON user_subscriptions.plan_id = plans.id
    WHERE plans.name <> 'FREE'
    GROUP BY plans.name
  ),
  subscription_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE user_subscriptions.status = 'active')::INTEGER AS active_count,
      COUNT(*) FILTER (WHERE user_subscriptions.status = 'cancelled')::INTEGER AS cancelled_count
    FROM user_subscriptions
    INNER JOIN plans ON plans.id = user_subscriptions.plan_id
    WHERE plans.name <> 'FREE'
  ),
  monthly_revenue_events AS (
    SELECT
      plans.name::TEXT AS plan_name,
      COALESCE(SUM(COALESCE(NULLIF(billing_events.event_data->>'amountPaid', '')::NUMERIC, 0) / 100), 0)::NUMERIC AS revenue
    FROM billing_events
    INNER JOIN user_subscriptions
      ON user_subscriptions.billing_provider = billing_events.provider
      AND user_subscriptions.provider_subscription_id = billing_events.provider_subscription_id
    INNER JOIN plans ON plans.id = user_subscriptions.plan_id
    WHERE billing_events.event_name = 'subscription_renewed'
      AND billing_events.created_at >= p_month_start
      AND billing_events.created_at < p_month_start + INTERVAL '1 month'
      AND plans.name <> 'FREE'
    GROUP BY plans.name
  ),
  plan_rows AS (
    SELECT
      active_plan_counts.plan_name,
      COALESCE(monthly_revenue_events.revenue, 0)::NUMERIC AS revenue,
      active_plan_counts.active_count AS active_subscriptions
    FROM active_plan_counts
    LEFT JOIN monthly_revenue_events
      ON monthly_revenue_events.plan_name = active_plan_counts.plan_name
  ),
  revenue_totals AS (
    SELECT COALESCE(SUM(plan_rows.revenue), 0)::NUMERIC AS monthly_revenue
    FROM plan_rows
  )
  SELECT
    revenue_totals.monthly_revenue,
    revenue_totals.monthly_revenue,
    revenue_totals.monthly_revenue * 12,
    subscription_counts.active_count,
    subscription_counts.cancelled_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'plan', plan_rows.plan_name,
          'monthlyRevenue', plan_rows.revenue,
          'activeSubscriptions', plan_rows.active_subscriptions
        )
        ORDER BY
          CASE plan_rows.plan_name
            WHEN 'PRO' THEN 1
            WHEN 'GUIDE' THEN 2
            ELSE 3
          END,
          plan_rows.plan_name
      ),
      '[]'::jsonb
    )
  FROM revenue_totals
  CROSS JOIN subscription_counts
  LEFT JOIN plan_rows ON TRUE
  GROUP BY
    revenue_totals.monthly_revenue,
    subscription_counts.active_count,
    subscription_counts.cancelled_count;
END;
$$ LANGUAGE plpgsql;
