import pool from '../pool.js';

class AdminQueries {
  async getOverview() {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)::BIGINT AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT AS new_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin')::BIGINT AS admin_users,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active')::BIGINT AS active_subscriptions,
        (
          SELECT COUNT(*)
          FROM user_subscriptions
          INNER JOIN plans ON plans.id = user_subscriptions.plan_id
          WHERE user_subscriptions.status = 'active'
            AND plans.name <> 'FREE'
        )::BIGINT AS paid_active_subscriptions,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'past_due')::BIGINT AS past_due_subscriptions,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'cancelled')::BIGINT AS cancelled_subscriptions,
        (SELECT COUNT(*) FROM usage_events WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT AS ai_requests,
        (SELECT COALESCE(SUM(tokens), 0) FROM usage_events WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT AS ai_tokens,
        (SELECT COALESCE(SUM(estimated_cost), 0) FROM usage_events WHERE created_at >= NOW() - INTERVAL '30 days')::NUMERIC AS ai_estimated_cost,
        (SELECT COUNT(*) FROM usage_events WHERE created_at >= NOW() - INTERVAL '30 days' AND estimated_cost IS NULL)::BIGINT AS ai_unpriced_requests,
        (SELECT COUNT(*) FROM reservations)::BIGINT AS total_reservations,
        (SELECT COUNT(*) FROM reservations WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT AS recent_reservations,
        (SELECT COALESCE(SUM(total_price), 0) FROM reservations WHERE created_at >= NOW() - INTERVAL '30 days')::NUMERIC AS reservation_revenue,
        (
          (SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '30 days')
          +
          (SELECT COUNT(*) FROM billing_events WHERE event_name = 'payment_failed' AND created_at >= NOW() - INTERVAL '30 days')
        )::BIGINT AS recent_failures
    `);

    return result.rows[0] || null;
  }

  async getUsers({ limit, offset }) {
    const [result, countResult] = await Promise.all([
      pool.query(`
      SELECT
        users.id,
        users.email,
        users.name,
        users.role,
        COALESCE(plans.name, 'FREE') AS plan,
        COALESCE(user_subscriptions.status, 'active') AS subscription_status,
        users.created_at
      FROM users
      LEFT JOIN user_subscriptions ON user_subscriptions.user_id = users.id
      LEFT JOIN plans ON plans.id = user_subscriptions.plan_id
      ORDER BY users.created_at DESC, users.id DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*)::BIGINT AS total_count FROM users'),
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

  async getAiCosts({ startAt, endAt }) {
    const result = await pool.query(`
      SELECT
        feature,
        COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost,
        COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::BIGINT AS priced_requests,
        COUNT(*) FILTER (WHERE estimated_cost IS NULL)::BIGINT AS unpriced_requests
      FROM usage_events
      WHERE created_at >= $1
        AND created_at < $2
      GROUP BY feature
      ORDER BY feature ASC
    `, [startAt, endAt]);

    return result.rows;
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
}

export { AdminQueries };
export default new AdminQueries();
