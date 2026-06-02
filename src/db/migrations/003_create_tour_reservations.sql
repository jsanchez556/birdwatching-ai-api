CREATE TABLE country (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  acr VARCHAR(8) NOT NULL UNIQUE
);

CREATE TABLE zone (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES country(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  des TEXT NOT NULL,
  rank INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(country_id, name)
);

CREATE TABLE node (
  id SERIAL PRIMARY KEY,
  parent_id INT NULL REFERENCES node(id),
  zone_id INT NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  des TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(parent_id, zone_id, name),
  UNIQUE(parent_id, zone_id, rank)
);

CREATE TABLE birds (
  id SERIAL PRIMARY KEY,
  species_code TEXT UNIQUE,
  name TEXT NOT NULL UNIQUE,
  tags TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE birds_by_node (
  node_id INT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  bird_id INT NOT NULL REFERENCES birds(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (node_id, bird_id),
  UNIQUE(node_id, rank)
);

CREATE TABLE IF NOT EXISTS tours (
  id SERIAL PRIMARY KEY,
  node_id INTEGER REFERENCES node(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  available_slots INTEGER NOT NULL CHECK (available_slots >= 0),
  duration_hours INTEGER NOT NULL CHECK (duration_hours > 0),
  difficulty TEXT NOT NULL,
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tours_node_id ON tours(node_id);
CREATE INDEX IF NOT EXISTS idx_tours_start_date ON tours(start_date);
CREATE INDEX IF NOT EXISTS idx_tours_end_date ON tours(end_date);

ALTER TABLE tours
  ADD CONSTRAINT chk_tours_lat_range CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  ADD CONSTRAINT chk_tours_lon_range CHECK (lon IS NULL OR lon BETWEEN -180 AND 180);


CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  conversation_id TEXT,
  tour_id INTEGER NOT NULL REFERENCES tours(id),
  participants INTEGER NOT NULL CHECK (participants > 0),
  confirmation_code TEXT NOT NULL UNIQUE,
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reservations_confirmation_code
ON reservations(confirmation_code);

CREATE INDEX IF NOT EXISTS idx_reservations_tour_created_at
ON reservations(tour_id, created_at DESC);

CREATE OR REPLACE FUNCTION get_tour_by_id(p_tour_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  name TEXT,
  price NUMERIC,
  available_slots INTEGER,
  location TEXT,
  duration_hours INTEGER,
  difficulty TEXT
)
LANGUAGE sql
AS $$
  SELECT
    t.id,
    t.name,
    t.price,
    t.available_slots,
    t.location,
    t.duration_hours,
    t.difficulty
  FROM tours AS t
  WHERE t.id = p_tour_id;
$$;

CREATE OR REPLACE FUNCTION get_available_tours(
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
  duration_hours INTEGER,
  difficulty TEXT
)
LANGUAGE sql
AS $$
  SELECT
    t.id,
    t.name,
    t.price,
    t.available_slots,
    t.location,
    t.duration_hours,
    t.difficulty
  FROM tours AS t
  WHERE t.available_slots >= COALESCE(p_min_slots, 1)
    AND (
      p_location IS NULL
      OR t.location ILIKE '%' || p_location || '%'
      OR t.name ILIKE '%' || p_location || '%'
    )
    AND (
      p_difficulty IS NULL
      OR LOWER(t.difficulty) = LOWER(p_difficulty)
    )
    AND (
      p_max_price IS NULL
      OR t.price <= p_max_price
    )
  ORDER BY t.location ASC, t.price ASC, t.id ASC;
$$;

CREATE OR REPLACE FUNCTION select_tour(
  p_tour_id INTEGER,
  p_participants INTEGER DEFAULT 1
)
RETURNS TABLE (
  success BOOLEAN,
  code TEXT,
  message TEXT,
  id INTEGER,
  name TEXT,
  price NUMERIC,
  available_slots INTEGER,
  location TEXT,
  duration_hours INTEGER,
  difficulty TEXT
)
LANGUAGE sql
AS $$
  SELECT
    CASE
      WHEN t.id IS NULL THEN false
      WHEN t.available_slots < COALESCE(p_participants, 1) THEN false
      ELSE true
    END AS success,
    CASE
      WHEN t.id IS NULL THEN 'TOUR_NOT_FOUND'
      WHEN t.available_slots < COALESCE(p_participants, 1) THEN 'INSUFFICIENT_AVAILABILITY'
      ELSE NULL
    END AS code,
    CASE
      WHEN t.id IS NULL THEN format('Tour %s was not found.', p_tour_id)
      WHEN t.available_slots < COALESCE(p_participants, 1)
        THEN format('%s has %s available slots, but %s were requested.', t.name, t.available_slots, COALESCE(p_participants, 1))
      ELSE format('%s is selected and has %s slots available.', t.name, t.available_slots)
    END AS message,
    t.id,
    t.name,
    t.price,
    t.available_slots,
    t.location,
    t.duration_hours,
    t.difficulty
  FROM (SELECT 1) AS seed
  LEFT JOIN tours AS t ON t.id = p_tour_id;
$$;

CREATE OR REPLACE FUNCTION create_tour_reservation(
  p_tour_id INTEGER,
  p_participants INTEGER,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_conversation_id TEXT,
  p_confirmation_code TEXT,
  p_discount_rate NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  code TEXT,
  message TEXT,
  id INTEGER,
  customer_name TEXT,
  customer_email TEXT,
  conversation_id TEXT,
  tour_id INTEGER,
  participants INTEGER,
  confirmation_code TEXT,
  created_at TIMESTAMP,
  total_price NUMERIC,
  tour_name TEXT,
  tour_price NUMERIC,
  tour_available_slots INTEGER,
  tour_location TEXT,
  tour_duration_hours INTEGER,
  tour_difficulty TEXT
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  selected_tour tours%ROWTYPE;
  inserted_reservation reservations%ROWTYPE;
  remaining_slots INTEGER;
  subtotal NUMERIC;
  discount_amount NUMERIC;
  calculated_total_price NUMERIC;
BEGIN
  BEGIN
    SELECT *
    INTO selected_tour
    FROM tours AS t
    WHERE t.id = p_tour_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT
        false,
        'TOUR_NOT_FOUND'::TEXT,
        format('Tour %s was not found.', p_tour_id)::TEXT,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::INTEGER,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::TIMESTAMP,
        NULL::NUMERIC,
        NULL::TEXT,
        NULL::NUMERIC,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::INTEGER,
        NULL::TEXT;
      RETURN;
    END IF;

    IF selected_tour.available_slots < p_participants THEN
      RETURN QUERY
      SELECT
        false,
        'INSUFFICIENT_AVAILABILITY'::TEXT,
        format(
          '%s has %s available slots, but %s were requested.',
          selected_tour.name,
          selected_tour.available_slots,
          p_participants
        )::TEXT,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        selected_tour.id,
        p_participants,
        NULL::TEXT,
        NULL::TIMESTAMP,
        NULL::NUMERIC,
        selected_tour.name,
        selected_tour.price,
        selected_tour.available_slots,
        selected_tour.location,
        selected_tour.duration_hours,
        selected_tour.difficulty;
      RETURN;
    END IF;

    subtotal := selected_tour.price * p_participants;
    discount_amount := ROUND(subtotal * COALESCE(p_discount_rate, 0), 2);
    calculated_total_price := ROUND(subtotal - discount_amount, 2);

    UPDATE tours AS t
    SET
      available_slots = t.available_slots - p_participants,
      updated_at = CURRENT_TIMESTAMP
    WHERE t.id = p_tour_id
    RETURNING t.available_slots INTO remaining_slots;

    INSERT INTO reservations (
      customer_name,
      customer_email,
      conversation_id,
      tour_id,
      participants,
      confirmation_code,
      total_price
    )
    VALUES (
      p_customer_name,
      p_customer_email,
      p_conversation_id,
      p_tour_id,
      p_participants,
      p_confirmation_code,
      calculated_total_price
    )
    RETURNING * INTO inserted_reservation;

    RETURN QUERY
    SELECT
      true,
      NULL::TEXT,
      NULL::TEXT,
      inserted_reservation.id,
      inserted_reservation.customer_name,
      inserted_reservation.customer_email,
      inserted_reservation.conversation_id,
      inserted_reservation.tour_id,
      inserted_reservation.participants,
      inserted_reservation.confirmation_code,
      inserted_reservation.created_at,
      inserted_reservation.total_price,
      selected_tour.name,
      selected_tour.price,
      remaining_slots,
      selected_tour.location,
      selected_tour.duration_hours,
      selected_tour.difficulty;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'create_tour_reservation failed for tour_id %: %',
        p_tour_id,
        SQLERRM
        USING ERRCODE = SQLSTATE;
  END;
END;
$$;
