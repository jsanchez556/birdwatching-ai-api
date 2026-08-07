-- Add the deterministic tour-image path contract, explicit duration units,
-- and occurrence-backed scheduled tours.

BEGIN;

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS duration_value integer,
  ADD COLUMN IF NOT EXISTS duration_unit text;

ALTER TABLE public.tours
  DROP CONSTRAINT IF EXISTS tours_image_path_check;

CREATE OR REPLACE FUNCTION public.admin_set_tour_image_path(
  p_id integer,
  p_image_path text
) RETURNS jsonb
  LANGUAGE plpgsql
AS $$
DECLARE result public.tours%ROWTYPE;
BEGIN
  UPDATE public.tours
  SET image_path = p_image_path,
      updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO result;

  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END;
$$;

UPDATE public.tours
SET duration_value = duration_hours,
    duration_unit = 'hours'
WHERE duration_value IS NULL OR duration_unit IS NULL;

UPDATE public.tours
SET available_slots = 0,
    start_date = NULL,
    end_date = NULL
WHERE tour_type = 'unscheduled';

UPDATE public.tours
SET max_participants = GREATEST(max_participants, available_slots, COALESCE((
  SELECT MAX(o.capacity) FROM public.tour_occurrences o WHERE o.tour_id = tours.id
), 1), 1)
WHERE tour_type = 'scheduled';

ALTER TABLE public.tours
  ALTER COLUMN duration_value SET NOT NULL,
  ALTER COLUMN duration_unit SET DEFAULT 'hours',
  ALTER COLUMN duration_unit SET NOT NULL;

ALTER TABLE public.tours
  DROP CONSTRAINT IF EXISTS tours_duration_value_check,
  DROP CONSTRAINT IF EXISTS tours_duration_unit_check,
  DROP CONSTRAINT IF EXISTS tours_schedule_fields_check;

ALTER TABLE public.tours
  ADD CONSTRAINT tours_duration_value_check CHECK (duration_value > 0),
  ADD CONSTRAINT tours_duration_unit_check CHECK (duration_unit IN ('hours', 'days')),
  ADD CONSTRAINT tours_schedule_fields_check CHECK (
    (tour_type = 'unscheduled' AND available_slots = 0 AND start_date IS NULL AND end_date IS NULL)
    OR (tour_type = 'scheduled' AND start_date IS NOT NULL AND end_date IS NOT NULL
      AND start_date <= end_date)
  );

CREATE OR REPLACE FUNCTION public.admin_create_tour(p_data jsonb) RETURNS jsonb
  LANGUAGE plpgsql
AS $$
DECLARE result public.tours%ROWTYPE;
BEGIN
  INSERT INTO public.tours (
    node_id, name, description, type, price, available_slots, duration_hours,
    duration_value, duration_unit, difficulty, start_date, end_date, source_url,
    tour_type, is_active, max_participants, minimum_price, created_by_user_id
  ) VALUES (
    (p_data->>'nodeId')::integer, p_data->>'name', p_data->>'description', p_data->>'type',
    (p_data->>'price')::numeric,
    CASE WHEN COALESCE(p_data->>'tourType', 'unscheduled') = 'scheduled'
      THEN (p_data->>'availableSlots')::integer ELSE 0 END,
    CASE WHEN COALESCE(p_data->>'durationUnit', 'hours') = 'days'
      THEN (p_data->>'durationValue')::integer * 24
      ELSE COALESCE((p_data->>'durationValue')::integer, (p_data->>'durationHours')::integer) END,
    COALESCE((p_data->>'durationValue')::integer, (p_data->>'durationHours')::integer),
    COALESCE(p_data->>'durationUnit', 'hours'), p_data->>'difficulty',
    CASE WHEN COALESCE(p_data->>'tourType', 'unscheduled') = 'scheduled'
      THEN (p_data->>'startDate')::date ELSE NULL END,
    CASE WHEN COALESCE(p_data->>'tourType', 'unscheduled') = 'scheduled'
      THEN (p_data->>'endDate')::date ELSE NULL END,
    p_data->>'sourceUrl', COALESCE(p_data->>'tourType', 'unscheduled'),
    COALESCE((p_data->>'isActive')::boolean, true),
    CASE WHEN COALESCE(p_data->>'tourType', 'unscheduled') = 'scheduled'
      THEN GREATEST((p_data->>'availableSlots')::integer, 1)
      ELSE GREATEST((p_data->>'maxParticipants')::integer, 1) END,
    COALESCE((p_data->>'minimumPrice')::numeric, (p_data->>'price')::numeric),
    (p_data->>'createdByUserId')::integer
  ) RETURNING * INTO result;

  IF result.tour_type = 'scheduled' AND result.available_slots > 0 THEN
    INSERT INTO public.tour_occurrences (tour_id, starts_at, capacity, remaining_spaces, status)
    VALUES (result.id, result.start_date::timestamp AT TIME ZONE 'America/Costa_Rica',
      result.available_slots, result.available_slots, 'scheduled')
    ON CONFLICT (tour_id, starts_at) DO NOTHING;
  END IF;

  RETURN to_jsonb(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_tour(p_id integer, p_data jsonb) RETURNS jsonb
  LANGUAGE plpgsql
AS $$
DECLARE result public.tours%ROWTYPE;
BEGIN
  UPDATE public.tours SET
    node_id = CASE WHEN p_data ? 'nodeId' THEN (p_data->>'nodeId')::integer ELSE node_id END,
    name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    description = CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE description END,
    type = CASE WHEN p_data ? 'type' THEN p_data->>'type' ELSE type END,
    price = CASE WHEN p_data ? 'price' THEN (p_data->>'price')::numeric ELSE price END,
    available_slots = CASE
      WHEN COALESCE(p_data->>'tourType', tour_type) = 'unscheduled' THEN 0
      WHEN p_data ? 'availableSlots' THEN (p_data->>'availableSlots')::integer ELSE available_slots END,
    duration_hours = CASE
      WHEN p_data ? 'durationValue' AND COALESCE(p_data->>'durationUnit', duration_unit) = 'days'
        THEN (p_data->>'durationValue')::integer * 24
      WHEN p_data ? 'durationValue' THEN (p_data->>'durationValue')::integer
      WHEN p_data ? 'durationHours' THEN (p_data->>'durationHours')::integer ELSE duration_hours END,
    duration_value = CASE WHEN p_data ? 'durationValue' THEN (p_data->>'durationValue')::integer
      WHEN p_data ? 'durationHours' THEN (p_data->>'durationHours')::integer ELSE duration_value END,
    duration_unit = CASE WHEN p_data ? 'durationUnit' THEN p_data->>'durationUnit'
      WHEN p_data ? 'durationHours' THEN 'hours' ELSE duration_unit END,
    difficulty = CASE WHEN p_data ? 'difficulty' THEN p_data->>'difficulty' ELSE difficulty END,
    start_date = CASE WHEN COALESCE(p_data->>'tourType', tour_type) = 'unscheduled' THEN NULL
      WHEN p_data ? 'startDate' THEN (p_data->>'startDate')::date ELSE start_date END,
    end_date = CASE WHEN COALESCE(p_data->>'tourType', tour_type) = 'unscheduled' THEN NULL
      WHEN p_data ? 'endDate' THEN (p_data->>'endDate')::date ELSE end_date END,
    source_url = CASE WHEN p_data ? 'sourceUrl' THEN p_data->>'sourceUrl' ELSE source_url END,
    tour_type = CASE WHEN p_data ? 'tourType' THEN p_data->>'tourType' ELSE tour_type END,
    is_active = CASE WHEN p_data ? 'isActive' THEN (p_data->>'isActive')::boolean ELSE is_active END,
    max_participants = CASE
      WHEN COALESCE(p_data->>'tourType', tour_type) = 'scheduled' AND p_data ? 'availableSlots'
        THEN GREATEST((p_data->>'availableSlots')::integer, 1)
      WHEN p_data ? 'maxParticipants' THEN (p_data->>'maxParticipants')::integer ELSE max_participants END,
    minimum_price = CASE WHEN p_data ? 'minimumPrice' THEN (p_data->>'minimumPrice')::numeric ELSE minimum_price END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_id RETURNING * INTO result;

  IF result.id IS NOT NULL AND result.tour_type = 'unscheduled' THEN
    UPDATE public.tour_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE tour_id = result.id AND status = 'scheduled';
  ELSIF result.id IS NOT NULL AND p_data ? 'availableSlots' AND EXISTS (
    SELECT 1 FROM public.tour_occurrences o WHERE o.tour_id = result.id AND o.status = 'scheduled'
  ) THEN
    IF result.available_slots > 0 AND EXISTS (SELECT 1 FROM public.tour_occurrences o WHERE o.tour_id = result.id
      AND o.status = 'scheduled' AND (o.capacity - o.remaining_spaces) > result.available_slots) THEN
      RAISE EXCEPTION 'availableSlots cannot be lower than already-booked spaces';
    END IF;
    UPDATE public.tour_occurrences o SET
      remaining_spaces = CASE WHEN result.available_slots = 0 THEN 0
        ELSE result.available_slots - (o.capacity - o.remaining_spaces) END,
      capacity = CASE WHEN result.available_slots = 0 THEN o.capacity ELSE result.available_slots END,
      updated_at = CURRENT_TIMESTAMP
    WHERE o.tour_id = result.id AND o.status = 'scheduled';
  ELSIF result.id IS NOT NULL AND result.available_slots > 0 AND NOT EXISTS (
    SELECT 1 FROM public.tour_occurrences o WHERE o.tour_id = result.id AND o.status = 'scheduled'
  ) THEN
    INSERT INTO public.tour_occurrences (tour_id, starts_at, capacity, remaining_spaces, status)
    VALUES (result.id, result.start_date::timestamp AT TIME ZONE 'America/Costa_Rica',
      result.available_slots, result.available_slots, 'scheduled')
    ON CONFLICT (tour_id, starts_at) DO UPDATE SET
      capacity = EXCLUDED.capacity, remaining_spaces = EXCLUDED.remaining_spaces,
      status = 'scheduled', updated_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END;
$$;

INSERT INTO public.tour_occurrences (tour_id, starts_at, capacity, remaining_spaces, status)
SELECT t.id,
  t.start_date::timestamp AT TIME ZONE 'America/Costa_Rica',
  t.available_slots,
  t.available_slots,
  'scheduled'
FROM public.tours t
WHERE t.tour_type = 'scheduled'
  AND t.start_date IS NOT NULL
  AND t.start_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::date
  AND t.available_slots > 0
  AND NOT EXISTS (SELECT 1 FROM public.tour_occurrences o WHERE o.tour_id = t.id)
ON CONFLICT (tour_id, starts_at) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_available_tours(
  p_location text DEFAULT NULL::text,
  p_difficulty text DEFAULT NULL::text,
  p_max_price numeric DEFAULT NULL::numeric,
  p_min_slots integer DEFAULT 1
) RETURNS TABLE(id integer, country text, name text, description text, price numeric,
  available_slots integer, location text, node text, subnode text, zone text, rank integer,
  lat numeric, lon numeric, start_date date, end_date date, birds jsonb, duration_hours integer,
  difficulty text, tour_type text, is_active boolean, max_participants integer,
  minimum_price numeric, occurrence_dates jsonb)
  LANGUAGE sql
AS $$
  SELECT g.* FROM get_tour_by_id_rows() g
  WHERE g.is_active
    AND ((g.tour_type = 'scheduled' AND g.start_date >
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::date
          AND g.available_slots >= COALESCE(p_min_slots, 1)
          AND jsonb_array_length(g.occurrence_dates) > 0)
      OR (g.tour_type = 'unscheduled' AND g.max_participants >= COALESCE(p_min_slots, 1)))
    AND (p_location IS NULL OR normalize_search_text(g.name || ' ' || g.location || ' ' || g.zone || ' ' || COALESCE(g.description, ''))
      LIKE '%' || normalize_search_text(p_location) || '%')
    AND (p_difficulty IS NULL OR lower(g.difficulty) = lower(p_difficulty))
    AND (p_max_price IS NULL OR g.minimum_price <= p_max_price)
  ORDER BY g.rank, g.minimum_price, g.id;
$$;

CREATE OR REPLACE FUNCTION public.create_tour_reservation_for_conversation(
  p_tour_id integer,
  p_tour_date date,
  p_participants integer,
  p_customer_name text,
  p_customer_email text,
  p_conversation_code text,
  p_confirmation_code text,
  p_discount_rate numeric,
  p_user_id integer
) RETURNS jsonb
  LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation_id bigint;
  v_result jsonb;
  v_tour_type text;
  v_start_date date;
BEGIN
  SELECT id INTO v_conversation_id
  FROM public.ensure_conversation(p_conversation_code, p_user_id);

  SELECT tour_type, start_date INTO v_tour_type, v_start_date
  FROM public.tours WHERE id = p_tour_id;

  IF v_tour_type = 'scheduled' AND (v_start_date IS NULL OR
    (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::date >= v_start_date) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOUR_DATE_UNAVAILABLE',
      'message', 'The scheduled tour has already started.');
  END IF;

  IF p_tour_date IS NOT NULL THEN
    RETURN public.create_tour_reservation_for_date(
      p_tour_id, p_tour_date, p_participants, p_customer_name, p_customer_email,
      v_conversation_id, p_confirmation_code, p_discount_rate, p_user_id
    );
  END IF;

  SELECT to_jsonb(reservation_result) INTO v_result
  FROM public.create_tour_reservation(
    p_tour_id, p_participants, p_customer_name, p_customer_email,
    v_conversation_id, p_confirmation_code, p_discount_rate, p_user_id
  ) AS reservation_result;

  RETURN v_result;
END;
$$;

COMMIT;
