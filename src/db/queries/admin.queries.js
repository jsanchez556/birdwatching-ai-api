import pool from '../pool.js';

class AdminQueries {
  async getOverview({ startAt, endAt }) {
    const result = await pool.query(`
      SELECT
        (
          SELECT COUNT(DISTINCT user_id)
          FROM usage_events
          WHERE created_at >= $1
            AND created_at < $2
        )::BIGINT AS active_users,
        (
          SELECT COUNT(*)
          FROM reservations
          WHERE created_at >= $1
            AND created_at < $2
        )::BIGINT AS completed_reservations,
        (
          SELECT COUNT(*)
          FROM usage_events
          WHERE created_at >= $1
            AND created_at < $2
        )::BIGINT AS ai_requests,
        (
          SELECT COALESCE(SUM(estimated_cost), 0)
          FROM usage_events
          WHERE created_at >= $1
            AND created_at < $2
        )::NUMERIC AS ai_estimated_cost
    `, [startAt, endAt]);

    return result.rows[0] || null;
  }

  async getUsers({ limit, offset, search = '' }) {
    const [result, countResult] = await Promise.all([
      pool.query(`
      SELECT
        users.id,
        users.email,
        users.name,
        users.role,
        COALESCE(plans.name, 'FREE') AS plan,
        COALESCE(user_subscriptions.status, 'active') AS subscription_status,
        users.suspended_at,
        users.suspension_reason_code,
        users.created_at
      FROM users
      LEFT JOIN user_subscriptions ON user_subscriptions.user_id = users.id
      LEFT JOIN plans ON plans.id = user_subscriptions.plan_id
      WHERE ($3 = '' OR users.email ILIKE '%' || $3 || '%'
        OR users.name ILIKE '%' || $3 || '%' OR users.role ILIKE '%' || $3 || '%')
      ORDER BY users.created_at DESC, users.id DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset, search]),
      pool.query(`SELECT COUNT(*)::BIGINT AS total_count FROM users
        WHERE ($1 = '' OR email ILIKE '%' || $1 || '%'
          OR name ILIKE '%' || $1 || '%' OR role ILIKE '%' || $1 || '%')`, [search]),
    ]);

    return {
      rows: result.rows,
      total: countResult.rows[0]?.total_count || 0,
    };
  }

  async getSubscriptions({ limit, offset }) {
    const [result, countResult] = await Promise.all([
      pool.query(`
      SELECT
        user_subscriptions.user_id,
        users.email,
        plans.name AS plan,
        user_subscriptions.status,
        user_subscriptions.billing_provider,
        user_subscriptions.current_period_end,
        user_subscriptions.created_at,
        user_subscriptions.updated_at
      FROM user_subscriptions
      INNER JOIN users ON users.id = user_subscriptions.user_id
      INNER JOIN plans ON plans.id = user_subscriptions.plan_id
      ORDER BY user_subscriptions.updated_at DESC, user_subscriptions.user_id DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*)::BIGINT AS total_count FROM user_subscriptions'),
    ]);

    return {
      rows: result.rows,
      total: countResult.rows[0]?.total_count || 0,
    };
  }

  async getAiUsage({ startAt, endAt }) {
    const result = await pool.query(`
      WITH filtered_usage AS (
        SELECT feature, user_id, tokens
        FROM usage_events
        WHERE created_at >= $1
          AND created_at < $2
      ),
      total_users AS (
        SELECT COUNT(DISTINCT user_id)::BIGINT AS value
        FROM filtered_usage
      )
      SELECT
        feature,
        COUNT(*)::BIGINT AS requests,
        COUNT(DISTINCT user_id)::BIGINT AS users,
        COALESCE(SUM(tokens), 0)::BIGINT AS tokens,
        total_users.value AS total_users
      FROM filtered_usage
      CROSS JOIN total_users
      GROUP BY feature
        , total_users.value
      ORDER BY feature ASC
    `, [startAt, endAt]);

    return result.rows;
  }

  async getAiCosts({ startAt, endAt, userLimit }) {
    const rangeParameters = [startAt, endAt];
    const [modelResult, featureResult, planResult, userResult] = await Promise.all([
      pool.query(`
      WITH filtered_usage AS (
        SELECT id, tokens, estimated_cost, model_usage
        FROM usage_events
        WHERE created_at >= $1
          AND created_at < $2
      ),
      expanded_models AS (
        SELECT
          filtered_usage.id,
          COALESCE(NULLIF(model_entry.value->>'model', ''), 'unknown') AS model,
          CASE
            WHEN model_entry.value IS NULL OR model_entry.value = 'null'::jsonb
              THEN filtered_usage.tokens
            WHEN model_entry.value->>'totalTokens' ~ '^[0-9]+$'
              THEN (model_entry.value->>'totalTokens')::BIGINT
            ELSE 0
          END AS tokens,
          CASE
            WHEN model_entry.value IS NULL OR model_entry.value = 'null'::jsonb
              THEN filtered_usage.estimated_cost
            WHEN model_entry.value->>'estimatedCostUsd' ~ '^[0-9]+([.][0-9]+)?$'
              THEN (model_entry.value->>'estimatedCostUsd')::NUMERIC
            ELSE NULL
          END AS estimated_cost
        FROM filtered_usage
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(filtered_usage.model_usage) = 'array' THEN
              CASE
                WHEN jsonb_array_length(filtered_usage.model_usage) > 0
                  THEN filtered_usage.model_usage
                ELSE '[null]'::jsonb
              END
            ELSE '[null]'::jsonb
          END
        ) AS model_entry(value) ON TRUE
      )
      SELECT
        model,
        COUNT(DISTINCT id)::BIGINT AS requests,
        COALESCE(SUM(tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost,
        COUNT(DISTINCT id) FILTER (WHERE estimated_cost IS NOT NULL)::BIGINT AS priced_requests,
        COUNT(DISTINCT id) FILTER (WHERE estimated_cost IS NULL)::BIGINT AS unpriced_requests
      FROM expanded_models
      GROUP BY model
      ORDER BY estimated_cost DESC, model ASC
      `, rangeParameters),
      pool.query(`
      SELECT
        feature,
        COUNT(*)::BIGINT AS requests,
        COALESCE(SUM(tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost,
        COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::BIGINT AS priced_requests,
        COUNT(*) FILTER (WHERE estimated_cost IS NULL)::BIGINT AS unpriced_requests
      FROM usage_events
      WHERE created_at >= $1
        AND created_at < $2
      GROUP BY feature
      ORDER BY estimated_cost DESC, feature ASC
      `, rangeParameters),
      pool.query(`
      SELECT
        COALESCE(plans.name, 'FREE') AS plan,
        COUNT(*)::BIGINT AS requests,
        COALESCE(SUM(usage_events.tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC AS estimated_cost,
        COUNT(*) FILTER (WHERE usage_events.estimated_cost IS NOT NULL)::BIGINT AS priced_requests,
        COUNT(*) FILTER (WHERE usage_events.estimated_cost IS NULL)::BIGINT AS unpriced_requests
      FROM usage_events
      LEFT JOIN user_subscriptions
        ON user_subscriptions.user_id = usage_events.user_id
      LEFT JOIN plans
        ON plans.id = user_subscriptions.plan_id
      WHERE usage_events.created_at >= $1
        AND usage_events.created_at < $2
      GROUP BY COALESCE(plans.name, 'FREE')
      ORDER BY estimated_cost DESC, plan ASC
      `, rangeParameters),
      pool.query(`
      SELECT
        usage_events.user_id,
        COALESCE(plans.name, 'FREE') AS plan,
        COUNT(*)::BIGINT AS requests,
        COALESCE(SUM(usage_events.tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC AS estimated_cost,
        COUNT(*) FILTER (WHERE usage_events.estimated_cost IS NOT NULL)::BIGINT AS priced_requests,
        COUNT(*) FILTER (WHERE usage_events.estimated_cost IS NULL)::BIGINT AS unpriced_requests
      FROM usage_events
      LEFT JOIN user_subscriptions
        ON user_subscriptions.user_id = usage_events.user_id
      LEFT JOIN plans
        ON plans.id = user_subscriptions.plan_id
      WHERE usage_events.created_at >= $1
        AND usage_events.created_at < $2
      GROUP BY usage_events.user_id, COALESCE(plans.name, 'FREE')
      ORDER BY estimated_cost DESC, usage_events.user_id ASC
      LIMIT $3
      `, [startAt, endAt, userLimit]),
    ]);

    return {
      byModel: modelResult.rows,
      byFeature: featureResult.rows,
      byPlan: planResult.rows,
      byUser: userResult.rows,
    };
  }

  async getReservations({ limit, offset }) {
    const [result, countResult] = await Promise.all([
      pool.query(`
      SELECT
        reservations.id,
        reservations.user_id,
        reservations.tour_id,
        tours.name AS tour_name,
        reservations.participants,
        reservations.total_price,
        reservations.created_at
      FROM reservations
      INNER JOIN tours ON tours.id = reservations.tour_id
      ORDER BY reservations.created_at DESC, reservations.id DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*)::BIGINT AS total_count FROM reservations'),
    ]);

    return {
      rows: result.rows,
      total: countResult.rows[0]?.total_count || 0,
    };
  }

  async getFailures({ limit, offset }) {
    const [result, countResult] = await Promise.all([
      pool.query(`
      WITH failures AS (
        SELECT
          jobs.job_id::TEXT AS id,
          'background_job'::TEXT AS category,
          jobs.job_type::TEXT AS failure_type,
          jobs.status::TEXT AS status,
          jobs.updated_at AS occurred_at
        FROM jobs
        WHERE jobs.status = 'failed'

        UNION ALL

        SELECT
          ('billing-' || billing_events.id)::TEXT AS id,
          'billing'::TEXT AS category,
          billing_events.event_name::TEXT AS failure_type,
          COALESCE(billing_events.status, 'failed')::TEXT AS status,
          billing_events.created_at AS occurred_at
        FROM billing_events
        WHERE billing_events.event_name = 'payment_failed'
      )
      SELECT
        id,
        category,
        failure_type,
        status,
        occurred_at
      FROM failures
      ORDER BY occurred_at DESC, id DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query(`
        SELECT (
          (SELECT COUNT(*) FROM jobs WHERE status = 'failed')
          +
          (SELECT COUNT(*) FROM billing_events WHERE event_name = 'payment_failed')
        )::BIGINT AS total_count
      `),
    ]);

    return {
      rows: result.rows,
      total: countResult.rows[0]?.total_count || 0,
    };
  }

  async getOperationalErrors({ startAt, endAt, limit }) {
    const result = await pool.query(`
      WITH operational_errors AS (
        SELECT
          jobs.job_id::TEXT AS source_id,
          'job'::TEXT AS source_type,
          jobs.updated_at AS occurred_at,
          jobs.user_id,
          NULLIF(jobs.result_meta->>'aiTraceId', '')::TEXT AS trace_id
        FROM jobs
        WHERE jobs.status = 'failed'
          AND jobs.updated_at >= $1
          AND jobs.updated_at < $2

        UNION ALL

        SELECT
          billing_events.id::TEXT AS source_id,
          'billing'::TEXT AS source_type,
          billing_events.created_at AS occurred_at,
          user_subscriptions.user_id,
          NULL::TEXT AS trace_id
        FROM billing_events
        LEFT JOIN user_subscriptions
          ON user_subscriptions.billing_provider = billing_events.provider
          AND user_subscriptions.provider_customer_id = billing_events.provider_customer_id
        WHERE billing_events.event_name = 'payment_failed'
          AND billing_events.created_at >= $1
          AND billing_events.created_at < $2
      )
      SELECT
        source_id,
        source_type,
        occurred_at,
        user_id,
        trace_id
      FROM operational_errors
      ORDER BY occurred_at DESC, source_type DESC, source_id DESC
      LIMIT $3
    `, [startAt, endAt, limit]);

    return result.rows;
  }
}

export { AdminQueries };
export default new AdminQueries();
