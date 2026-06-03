CREATE INDEX IF NOT EXISTS idx_reservations_user_created_at
ON reservations(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS tour_cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tour_id INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  scheduled_date DATE,
  participants INTEGER NOT NULL DEFAULT 1 CHECK (participants > 0),
  needs_transportation BOOLEAN,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tour_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tour_cart_one_tour_per_day
  ON tour_cart_items(user_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS tour_cart_items_user_id_idx
  ON tour_cart_items(user_id);

DROP FUNCTION IF EXISTS get_tour_cart_items(INTEGER);
CREATE FUNCTION get_tour_cart_items(p_user_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  tour_id INTEGER,
  scheduled_date DATE,
  participants INTEGER,
  needs_transportation BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tour_name TEXT,
  tour_description TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_node TEXT,
  tour_subnode TEXT,
  tour_zone TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE sql
AS $$
  SELECT
    i.id,
    i.user_id,
    i.tour_id,
    i.scheduled_date,
    i.participants,
    i.needs_transportation,
    i.metadata,
    i.created_at,
    i.updated_at,
    t.name AS tour_name,
    t.description AS tour_description,
    t.price AS tour_price,
    t.available_slots AS tour_available_slots,
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS tour_location,
    COALESCE(parent_node.name, tour_node.name) AS tour_node,
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END AS tour_subnode,
    z.name AS tour_zone,
    t.duration_hours AS tour_duration_hours,
    t.difficulty AS tour_difficulty
  FROM tour_cart_items AS i
  INNER JOIN tours AS t ON t.id = i.tour_id
  INNER JOIN node AS tour_node ON tour_node.id = t.node_id
  INNER JOIN zone AS z ON z.id = tour_node.zone_id
  LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
  WHERE i.user_id = p_user_id
  ORDER BY i.scheduled_date NULLS LAST, i.created_at ASC;
$$;

DROP FUNCTION IF EXISTS get_tour_cart_item_by_id(INTEGER, INTEGER);
CREATE FUNCTION get_tour_cart_item_by_id(p_user_id INTEGER, p_item_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  tour_id INTEGER,
  scheduled_date DATE,
  participants INTEGER,
  needs_transportation BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tour_name TEXT,
  tour_description TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_node TEXT,
  tour_subnode TEXT,
  tour_zone TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE sql
AS $$
  SELECT *
  FROM get_tour_cart_items(p_user_id) AS item
  WHERE item.id = p_item_id;
$$;

DROP FUNCTION IF EXISTS upsert_tour_cart_item(INTEGER, INTEGER, DATE, INTEGER, BOOLEAN, JSONB);
CREATE FUNCTION upsert_tour_cart_item(
  p_user_id INTEGER,
  p_tour_id INTEGER,
  p_scheduled_date DATE DEFAULT NULL,
  p_participants INTEGER DEFAULT 1,
  p_needs_transportation BOOLEAN DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  tour_id INTEGER,
  scheduled_date DATE,
  participants INTEGER,
  needs_transportation BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tour_name TEXT,
  tour_description TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_node TEXT,
  tour_subnode TEXT,
  tour_zone TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  INSERT INTO tour_cart_items (
    user_id,
    tour_id,
    scheduled_date,
    participants,
    needs_transportation,
    metadata,
    updated_at
  )
  VALUES (
    p_user_id,
    p_tour_id,
    p_scheduled_date,
    p_participants,
    p_needs_transportation,
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT ON CONSTRAINT tour_cart_items_user_id_tour_id_key
  DO UPDATE SET
    scheduled_date = COALESCE(EXCLUDED.scheduled_date, tour_cart_items.scheduled_date),
    participants = EXCLUDED.participants,
    needs_transportation = COALESCE(EXCLUDED.needs_transportation, tour_cart_items.needs_transportation),
    metadata = tour_cart_items.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING tour_cart_items.id INTO v_item_id;

  RETURN QUERY
  SELECT *
  FROM get_tour_cart_item_by_id(p_user_id, v_item_id);
END;
$$;

DROP FUNCTION IF EXISTS update_tour_cart_item(INTEGER, INTEGER, DATE, INTEGER, BOOLEAN);
CREATE FUNCTION update_tour_cart_item(
  p_user_id INTEGER,
  p_item_id INTEGER,
  p_scheduled_date DATE DEFAULT NULL,
  p_participants INTEGER DEFAULT NULL,
  p_needs_transportation BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  tour_id INTEGER,
  scheduled_date DATE,
  participants INTEGER,
  needs_transportation BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tour_name TEXT,
  tour_description TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_node TEXT,
  tour_subnode TEXT,
  tour_zone TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  UPDATE tour_cart_items AS cart_item
  SET
    scheduled_date = COALESCE(p_scheduled_date, cart_item.scheduled_date),
    participants = COALESCE(p_participants, cart_item.participants),
    needs_transportation = COALESCE(p_needs_transportation, cart_item.needs_transportation),
    updated_at = NOW()
  WHERE cart_item.user_id = p_user_id AND cart_item.id = p_item_id
  RETURNING cart_item.id INTO v_item_id;

  IF v_item_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM get_tour_cart_item_by_id(p_user_id, v_item_id);
END;
$$;

DROP FUNCTION IF EXISTS delete_tour_cart_item(INTEGER, INTEGER);
CREATE FUNCTION delete_tour_cart_item(p_user_id INTEGER, p_item_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  WITH deleted AS (
    DELETE FROM tour_cart_items
    WHERE tour_cart_items.user_id = p_user_id AND tour_cart_items.id = p_item_id
    RETURNING tour_cart_items.id
  )
  SELECT EXISTS(SELECT 1 FROM deleted);
$$;

DROP FUNCTION IF EXISTS clear_tour_cart(INTEGER);
CREATE FUNCTION clear_tour_cart(p_user_id INTEGER)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM tour_cart_items
  WHERE tour_cart_items.user_id = p_user_id;
$$;

DROP FUNCTION IF EXISTS delete_tour_cart_items_by_ids(INTEGER, INTEGER[]);
CREATE FUNCTION delete_tour_cart_items_by_ids(p_user_id INTEGER, p_item_ids INTEGER[])
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM tour_cart_items
  WHERE tour_cart_items.user_id = p_user_id
    AND tour_cart_items.id = ANY(p_item_ids);
$$;
