CREATE OR REPLACE FUNCTION normalize_search_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(translate(
    COALESCE(p_value, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
  ));
$$;

DROP FUNCTION IF EXISTS get_available_tours(TEXT, TEXT, NUMERIC, INTEGER);
CREATE FUNCTION get_available_tours(
  p_location TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_min_slots INTEGER DEFAULT 1
)
RETURNS TABLE (
  id INTEGER,
  name TEXT,
  price NUMERIC,
  available_slots INTEGER,
  location TEXT,
  node TEXT,
  subnode TEXT,
  zone TEXT,
  duration_hours INTEGER,
  difficulty TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_location TEXT := normalize_search_text(p_location);
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.price,
    t.available_slots,
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS location,
    COALESCE(parent_node.name, tour_node.name) AS node,
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END AS subnode,
    z.name AS zone,
    t.duration_hours,
    t.difficulty
  FROM tours AS t
  JOIN node AS tour_node ON tour_node.id = t.node_id
  JOIN zone AS z ON z.id = tour_node.zone_id
  LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
  WHERE t.available_slots >= COALESCE(p_min_slots, 1)
    AND (
      p_location IS NULL
      OR normalize_search_text(tour_node.name) LIKE '%' || normalized_location || '%'
      OR normalize_search_text(parent_node.name) LIKE '%' || normalized_location || '%'
      OR normalize_search_text(z.name) LIKE '%' || normalized_location || '%'
      OR normalize_search_text(t.name) LIKE '%' || normalized_location || '%'
    )
    AND (
      p_difficulty IS NULL
      OR LOWER(t.difficulty) = LOWER(p_difficulty)
    )
    AND (
      p_max_price IS NULL
      OR t.price <= p_max_price
    )
  ORDER BY z.rank ASC, COALESCE(parent_node.rank, tour_node.rank) ASC, tour_node.rank ASC, t.price ASC, t.id ASC;
END;
$$;
