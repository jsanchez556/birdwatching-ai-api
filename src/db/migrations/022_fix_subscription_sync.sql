CREATE OR REPLACE FUNCTION ensure_free_user_subscription(p_user_id INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  plan_id INTEGER,
  plan_name TEXT,
  status TEXT
) AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, plan_id, status)
  SELECT p_user_id, plans.id, 'active'
  FROM plans
  WHERE plans.name = 'FREE'
  ON CONFLICT ON CONSTRAINT user_subscriptions_pkey DO NOTHING;

  RETURN QUERY
  SELECT
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    plans.name,
    user_subscriptions.status
  FROM user_subscriptions
  INNER JOIN plans ON plans.id = user_subscriptions.plan_id
  WHERE user_subscriptions.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
