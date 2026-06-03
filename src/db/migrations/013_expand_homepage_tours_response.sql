DROP FUNCTION IF EXISTS get_available_tours(TEXT, TEXT, NUMERIC, INTEGER);
CREATE FUNCTION get_available_tours(
  p_location TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_min_slots INTEGER DEFAULT 1
)
RETURNS TABLE (
  id INTEGER,
  country TEXT,
  name TEXT,
  description TEXT,
  price NUMERIC,
  available_slots INTEGER,
  location TEXT,
  node TEXT,
  subnode TEXT,
  zone TEXT,
  rank INTEGER,
  lat NUMERIC,
  lon NUMERIC,
  start_date DATE,
  end_date DATE,
  birds JSONB,
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
    c.acr::TEXT AS country,
    t.name,
    t.description,
    t.price,
    t.available_slots,
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS location,
    COALESCE(parent_node.name, tour_node.name) AS node,
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END AS subnode,
    z.name AS zone,
    tour_node.rank AS rank,
    COALESCE(t.lat, tour_node.lat, parent_node.lat) AS lat,
    COALESCE(t.lon, tour_node.lon, parent_node.lon) AS lon,
    t.start_date,
    t.end_date,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'species_code', b.species_code,
          'name', b.name
        )
        ORDER BY bbn.rank ASC, b.name ASC
      )
      FROM birds_by_node AS bbn
      JOIN birds AS b ON b.id = bbn.bird_id
      WHERE bbn.node_id = tour_node.id
        AND bbn.is_active = true
        AND b.is_active = true
    ), '[]'::jsonb) AS birds,
    t.duration_hours,
    t.difficulty
  FROM tours AS t
  JOIN node AS tour_node ON tour_node.id = t.node_id
  JOIN zone AS z ON z.id = tour_node.zone_id
  JOIN country AS c ON c.id = z.country_id
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
