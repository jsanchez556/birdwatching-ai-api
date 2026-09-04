-- Consolidated Birdwatching AI PostgreSQL functions and triggers.
-- Apply after 001_schema.sql and 002_seed.sql.

BEGIN;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

--
-- Name: admin_create_bird(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_bird(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds%ROWTYPE;
BEGIN
  INSERT INTO birds (species_code, name, tags, is_active)
  VALUES (NULLIF(p_data->>'speciesCode', ''), p_data->>'name',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data->'tags', '[]'::jsonb))),
    COALESCE((p_data->>'isActive')::boolean, true))
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_create_bird_by_node(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_bird_by_node(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds_by_node%ROWTYPE;
BEGIN
  INSERT INTO birds_by_node (node_id, bird_id, rank, is_active)
  VALUES ((p_data->>'nodeId')::integer, (p_data->>'birdId')::integer,
    (p_data->>'rank')::integer, COALESCE((p_data->>'isActive')::boolean, true))
  ON CONFLICT (node_id, bird_id) DO UPDATE SET rank = EXCLUDED.rank, is_active = EXCLUDED.is_active
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_create_country(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_country(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result country%ROWTYPE;
BEGIN
  INSERT INTO country (name, acr, latitude, longitude, zoom)
  VALUES (
    p_data->>'name',
    upper(p_data->>'acr'),
    (p_data->>'latitude')::numeric,
    (p_data->>'longitude')::numeric,
    (p_data->>'zoom')::smallint
  )
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_create_node(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_node(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result node%ROWTYPE;
BEGIN
  INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des, is_active)
  VALUES ((p_data->>'parentId')::integer, (p_data->>'zoneId')::integer, p_data->>'name',
    (p_data->>'rank')::integer, (p_data->>'lat')::numeric, (p_data->>'lon')::numeric,
    p_data->>'description', COALESCE((p_data->>'isActive')::boolean, true))
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_create_tour(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_tour(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result tours%ROWTYPE;
BEGIN
  INSERT INTO tours (
    node_id, name, description, type, price, available_slots, duration_hours,
    duration_value, duration_unit,
    difficulty, start_date, end_date, source_url, tour_type,
    is_active, max_participants, minimum_price, created_by_user_id
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
    (p_data->>'startDate')::date, (p_data->>'endDate')::date, p_data->>'sourceUrl',
    COALESCE(p_data->>'tourType', 'unscheduled'), COALESCE((p_data->>'isActive')::boolean, true),
    CASE WHEN COALESCE(p_data->>'tourType', 'unscheduled') = 'scheduled'
      THEN GREATEST((p_data->>'availableSlots')::integer, 1)
      ELSE GREATEST((p_data->>'maxParticipants')::integer, 1) END,
    COALESCE((p_data->>'minimumPrice')::numeric, (p_data->>'price')::numeric),
    (p_data->>'createdByUserId')::integer
  ) RETURNING * INTO result;
  IF result.tour_type = 'scheduled' AND result.available_slots > 0 THEN
    INSERT INTO tour_occurrences (tour_id, starts_at, capacity, remaining_spaces, status)
    VALUES (result.id, result.start_date::timestamp AT TIME ZONE 'America/Costa_Rica',
      result.available_slots, result.available_slots, 'scheduled')
    ON CONFLICT (tour_id, starts_at) DO NOTHING;
  END IF;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_create_zone(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_zone(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result zone%ROWTYPE;
BEGIN
  INSERT INTO zone (country_id, name, des, rank, is_active)
  VALUES ((p_data->>'countryId')::integer, p_data->>'name', p_data->>'description',
    (p_data->>'rank')::integer, COALESCE((p_data->>'isActive')::boolean, true))
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END; $$;


--
-- Name: admin_delete_bird(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_bird(p_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds%ROWTYPE;
BEGIN
  UPDATE birds SET is_active = false WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_delete_bird_by_node(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_bird_by_node(p_node_id integer, p_bird_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds_by_node%ROWTYPE;
BEGIN
  UPDATE birds_by_node SET is_active = false
  WHERE node_id = p_node_id AND bird_id = p_bird_id RETURNING * INTO result;
  RETURN CASE WHEN result.node_id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_delete_country(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_country(p_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result country%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM zone WHERE country_id = p_id) THEN
    RAISE EXCEPTION 'Country is referenced by one or more zones' USING ERRCODE = '23503';
  END IF;
  DELETE FROM country WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_delete_node(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_node(p_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result node%ROWTYPE;
BEGIN
  UPDATE node SET is_active = false WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_delete_tour(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_tour(p_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result tours%ROWTYPE;
BEGIN
  UPDATE tours SET is_active = false, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_delete_zone(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_zone(p_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result zone%ROWTYPE;
BEGIN
  UPDATE zone SET is_active = false WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_bird(integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_bird(p_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds%ROWTYPE;
BEGIN
  UPDATE birds SET
    species_code = CASE WHEN p_data ? 'speciesCode' THEN NULLIF(p_data->>'speciesCode', '') ELSE species_code END,
    name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    tags = CASE WHEN p_data ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')) ELSE tags END,
    is_active = CASE WHEN p_data ? 'isActive' THEN (p_data->>'isActive')::boolean ELSE is_active END
  WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_bird_by_node(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_bird_by_node(p_node_id integer, p_bird_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result birds_by_node%ROWTYPE;
BEGIN
  UPDATE birds_by_node SET
    rank = CASE WHEN p_data ? 'rank' THEN (p_data->>'rank')::integer ELSE rank END,
    is_active = CASE WHEN p_data ? 'isActive' THEN (p_data->>'isActive')::boolean ELSE is_active END
  WHERE node_id = p_node_id AND bird_id = p_bird_id RETURNING * INTO result;
  RETURN CASE WHEN result.node_id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_country(integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_country(p_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result country%ROWTYPE;
BEGIN
  UPDATE country SET
    name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    acr = CASE WHEN p_data ? 'acr' THEN upper(p_data->>'acr') ELSE acr END,
    latitude = CASE WHEN p_data ? 'latitude' THEN (p_data->>'latitude')::numeric ELSE latitude END,
    longitude = CASE WHEN p_data ? 'longitude' THEN (p_data->>'longitude')::numeric ELSE longitude END,
    zoom = CASE WHEN p_data ? 'zoom' THEN (p_data->>'zoom')::smallint ELSE zoom END
  WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_node(integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_node(p_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result node%ROWTYPE;
BEGIN
  UPDATE node SET
    parent_id = CASE WHEN p_data ? 'parentId' THEN (p_data->>'parentId')::integer ELSE parent_id END,
    zone_id = CASE WHEN p_data ? 'zoneId' THEN (p_data->>'zoneId')::integer ELSE zone_id END,
    name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    rank = CASE WHEN p_data ? 'rank' THEN (p_data->>'rank')::integer ELSE rank END,
    lat = CASE WHEN p_data ? 'lat' THEN (p_data->>'lat')::numeric ELSE lat END,
    lon = CASE WHEN p_data ? 'lon' THEN (p_data->>'lon')::numeric ELSE lon END,
    des = CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE des END,
    is_active = CASE WHEN p_data ? 'isActive' THEN (p_data->>'isActive')::boolean ELSE is_active END
  WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_tour(integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_tour(p_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result tours%ROWTYPE;
BEGIN
  UPDATE tours SET
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
  IF result.tour_type = 'unscheduled' THEN
    UPDATE tour_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE tour_id = result.id AND status = 'scheduled';
  ELSIF p_data ? 'availableSlots' AND EXISTS (
    SELECT 1 FROM tour_occurrences o WHERE o.tour_id = result.id AND o.status = 'scheduled'
  ) THEN
    IF result.available_slots > 0 AND EXISTS (SELECT 1 FROM tour_occurrences o WHERE o.tour_id = result.id
      AND o.status = 'scheduled' AND (o.capacity - o.remaining_spaces) > result.available_slots) THEN
      RAISE EXCEPTION 'availableSlots cannot be lower than already-booked spaces';
    END IF;
    UPDATE tour_occurrences o SET
      remaining_spaces = CASE WHEN result.available_slots = 0 THEN 0
        ELSE result.available_slots - (o.capacity - o.remaining_spaces) END,
      capacity = CASE WHEN result.available_slots = 0 THEN o.capacity ELSE result.available_slots END,
      updated_at = CURRENT_TIMESTAMP
    WHERE o.tour_id = result.id AND o.status = 'scheduled';
  ELSIF result.available_slots > 0 AND NOT EXISTS (
    SELECT 1 FROM tour_occurrences o WHERE o.tour_id = result.id AND o.status = 'scheduled'
  ) THEN
    INSERT INTO tour_occurrences (tour_id, starts_at, capacity, remaining_spaces, status)
    VALUES (result.id, result.start_date::timestamp AT TIME ZONE 'America/Costa_Rica',
      result.available_slots, result.available_slots, 'scheduled')
    ON CONFLICT (tour_id, starts_at) DO UPDATE SET
      capacity = EXCLUDED.capacity, remaining_spaces = EXCLUDED.remaining_spaces,
      status = 'scheduled', updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: admin_update_zone(integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_zone(p_id integer, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result zone%ROWTYPE;
BEGIN
  UPDATE zone SET
    country_id = CASE WHEN p_data ? 'countryId' THEN (p_data->>'countryId')::integer ELSE country_id END,
    name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    des = CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE des END,
    rank = CASE WHEN p_data ? 'rank' THEN (p_data->>'rank')::integer ELSE rank END,
    is_active = CASE WHEN p_data ? 'isActive' THEN (p_data->>'isActive')::boolean ELSE is_active END
  WHERE id = p_id RETURNING * INTO result;
  RETURN CASE WHEN result.id IS NULL THEN NULL ELSE to_jsonb(result) END;
END; $$;


--
-- Name: assert_single_default_plan_provider_mapping(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_single_default_plan_provider_mapping() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  mapping_provider TEXT;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT provider_mappings.provider
  INTO mapping_provider
  FROM provider_mappings
  WHERE provider_mappings.id = NEW.provider_mapping_id;

  IF EXISTS (
    SELECT 1
    FROM plan_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
    WHERE plan_provider_mappings.plan_id = NEW.plan_id
      AND provider_mappings.provider = mapping_provider
      AND plan_provider_mappings.is_default = TRUE
      AND plan_provider_mappings.provider_mapping_id <> NEW.provider_mapping_id
  ) THEN
    RAISE EXCEPTION 'Default provider mapping already exists for plan/provider';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: assert_single_default_tour_provider_mapping(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_single_default_tour_provider_mapping() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  mapping_provider TEXT;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT provider_mappings.provider
  INTO mapping_provider
  FROM provider_mappings
  WHERE provider_mappings.id = NEW.provider_mapping_id;

  IF EXISTS (
    SELECT 1
    FROM tour_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = tour_provider_mappings.provider_mapping_id
    WHERE tour_provider_mappings.tour_id = NEW.tour_id
      AND provider_mappings.provider = mapping_provider
      AND tour_provider_mappings.is_default = TRUE
      AND tour_provider_mappings.provider_mapping_id <> NEW.provider_mapping_id
  ) THEN
    RAISE EXCEPTION 'Default provider mapping already exists for tour/provider';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: assign_user_experiment_variant(integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_user_experiment_variant(p_user_id integer, p_experiment_key text, p_variant text) RETURNS TABLE(experiment_key text, variant text, assigned_at timestamp with time zone)
    LANGUAGE sql
    AS $$
  INSERT INTO experiment_assignments AS assignment (
    user_id,
    experiment_key,
    variant
  )
  VALUES (
    p_user_id,
    BTRIM(p_experiment_key),
    BTRIM(p_variant)
  )
  ON CONFLICT (user_id, experiment_key)
  DO UPDATE SET variant = assignment.variant
  RETURNING
    assignment.experiment_key,
    assignment.variant,
    assignment.assigned_at;
$$;


--
-- Name: book_reservation_from_state(text, integer, integer, text, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_reservation_from_state(p_conversation_code text, p_user_id integer, p_expected_version integer, p_confirmation_code text, p_discount_rate numeric, p_idempotency_key text, p_source_type text, p_source_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  conversation_row conversations%ROWTYPE;
  state_row reservation_conversation_states%ROWTYPE;
  booking_result JSONB;
  confirmed JSONB;
BEGIN
  SELECT * INTO conversation_row FROM conversations WHERE conversation_code = p_conversation_code FOR UPDATE;
  IF NOT FOUND OR (conversation_row.user_id IS NOT NULL AND conversation_row.user_id IS DISTINCT FROM p_user_id)
    THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO state_row FROM reservation_conversation_states
    WHERE conversation_id = conversation_row.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation state not found' USING ERRCODE = 'P0002'; END IF;
  IF state_row.booking_idempotency_key = p_idempotency_key AND state_row.reservation_id IS NOT NULL THEN
    SELECT jsonb_build_object('success', true, 'idempotent', true, 'state_version', state_row.version,
      'id', r.id, 'user_id', r.user_id, 'customer_name', r.customer_name,
      'customer_email', r.customer_email, 'conversation_id', conversation_row.conversation_code,
      'tour_id', r.tour_id, 'tour_date', r.tour_date, 'participants', r.participants,
      'confirmation_code', r.confirmation_code, 'created_at', r.created_at,
      'total_price', r.total_price, 'tour_name', t.name,
      'tour_price', GREATEST(t.minimum_price, t.price),
      'tour_available_slots', CASE WHEN t.tour_type = 'scheduled' THEN COALESCE(o.remaining_spaces, 0) ELSE t.max_participants END,
      'tour_type', t.tour_type,
      'tour_location', COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name),
      'tour_duration_hours', t.duration_hours, 'tour_difficulty', t.difficulty)
    INTO booking_result
    FROM reservations r JOIN tours t ON t.id = r.tour_id
    LEFT JOIN tour_occurrences o ON o.id = r.occurrence_id
    JOIN node tour_node ON tour_node.id = t.node_id
    JOIN zone z ON z.id = tour_node.zone_id
    LEFT JOIN node parent_node ON parent_node.id = tour_node.parent_id
    WHERE r.id = state_row.reservation_id;
    RETURN booking_result;
  END IF;
  IF state_row.version <> p_expected_version THEN RAISE EXCEPTION 'reservation state version conflict' USING ERRCODE = '40001'; END IF;
  IF state_row.status <> 'ready_for_confirmation' OR state_row.proposed_values <> '{}'::jsonb
    THEN RAISE EXCEPTION 'reservation state is not ready for booking' USING ERRCODE = '22023'; END IF;
  confirmed := state_row.confirmed_values;
  IF NOT (jsonb_strip_nulls(confirmed) ?& ARRAY['tourId','date','participants','transferRequired','customerName','customerEmail','itineraryStartDate','itineraryEndDate'])
    THEN RAISE EXCEPTION 'reservation state is missing required confirmed values' USING ERRCODE = '22023'; END IF;
  IF (confirmed->>'date')::date < (confirmed->>'itineraryStartDate')::date
    OR (confirmed->>'date')::date > (confirmed->>'itineraryEndDate')::date THEN
    RETURN jsonb_build_object('success', false, 'code', 'DATE_OUTSIDE_ITINERARY', 'message', 'The selected date is outside the itinerary range.', 'state_version', state_row.version);
  END IF;
  booking_result := create_tour_reservation_for_date((confirmed->>'tourId')::integer,
    (confirmed->>'date')::date, (confirmed->>'participants')::integer,
    confirmed->>'customerName', confirmed->>'customerEmail', conversation_row.id,
    p_confirmation_code, COALESCE(p_discount_rate, 0), p_user_id);
  IF COALESCE((booking_result->>'success')::boolean, false) = false THEN
    RETURN booking_result || jsonb_build_object('state_version', state_row.version);
  END IF;
  UPDATE reservation_conversation_states SET version = state_row.version + 1, status = 'confirmed',
    reservation_id = (booking_result->>'id')::integer, booking_idempotency_key = p_idempotency_key,
    updated_at = CURRENT_TIMESTAMP WHERE conversation_id = state_row.conversation_id;
  INSERT INTO reservation_state_audit_events (conversation_id, previous_version, new_version,
    event_type, changed_fields, previous_values, resulting_values, confirmation_state, source_type, source_id)
  VALUES (state_row.conversation_id, state_row.version, state_row.version + 1, 'booking_succeeded',
    ARRAY['status','reservationId'], jsonb_build_object('status', state_row.status),
    jsonb_build_object('status','confirmed','reservationId',(booking_result->>'id')::integer),
    jsonb_build_object('status','confirmed','hasProposedValues',false), p_source_type, p_source_id);
  RETURN booking_result || jsonb_build_object('state_version', state_row.version + 1, 'idempotent', false);
END;
$$;


--
-- Name: change_user_role_by_admin(bigint, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_user_role_by_admin(p_audit_id bigint, p_admin_user_id integer, p_target_user_id integer, p_role text) RETURNS TABLE(user_id integer, previous_role text, role text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_previous_role TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE id = p_audit_id AND admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  IF p_role NOT IN ('admin', 'customer', 'tour guide') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_USER_ROLE';
  END IF;

  -- Serialize role changes so two concurrent demotions cannot both observe a
  -- stale active-administrator count.
  LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

  SELECT users.role INTO v_previous_role
  FROM users WHERE users.id = p_target_user_id FOR UPDATE;

  IF v_previous_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_USER_NOT_FOUND';
  END IF;

  IF p_target_user_id = p_admin_user_id AND p_role <> 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SELF_ADMIN_DEMOTION_FORBIDDEN';
  END IF;

  IF v_previous_role = 'admin' AND p_role <> 'admin' AND (
    SELECT COUNT(*) FROM users WHERE users.role = 'admin' AND users.suspended_at IS NULL
  ) <= 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LAST_ACTIVE_ADMIN_REQUIRED';
  END IF;

  UPDATE users SET role = p_role, updated_at = NOW() WHERE id = p_target_user_id;
  UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE refresh_tokens.user_id = p_target_user_id AND revoked_at IS NULL;
  UPDATE admin_audit_logs SET metadata = metadata || jsonb_build_object(
    'outcome', 'succeeded', 'previousRole', v_previous_role, 'role', p_role
  ) WHERE id = p_audit_id;

  RETURN QUERY SELECT p_target_user_id, v_previous_role, p_role;
END;
$$;


--
-- Name: clear_tour_cart(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_tour_cart(p_user_id integer) RETURNS void
    LANGUAGE sql
    AS $$
  DELETE FROM tour_cart_items
  WHERE tour_cart_items.user_id = p_user_id;
$$;


--
-- Name: complete_job(text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_job(p_job_id text, p_result jsonb, p_result_meta jsonb) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'completed',
    result = COALESCE(p_result, '{}'::jsonb),
    result_meta = COALESCE(p_result_meta, '{}'::jsonb),
    error_message = NULL,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$;


--
-- Name: create_admin_audit_log(integer, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_admin_audit_log(p_admin_user_id integer, p_action text, p_target_type text, p_target_id text, p_metadata jsonb) RETURNS TABLE(id bigint, admin_user_id integer, action text, target_type text, target_id text, metadata jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE users.id = p_admin_user_id
      AND users.role = 'admin'
      AND users.suspended_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;

  RETURN QUERY
  INSERT INTO admin_audit_logs (
    admin_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  VALUES (
    p_admin_user_id,
    p_action,
    p_target_type,
    p_target_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING
    admin_audit_logs.id,
    admin_audit_logs.admin_user_id,
    admin_audit_logs.action,
    admin_audit_logs.target_type,
    admin_audit_logs.target_id,
    admin_audit_logs.metadata,
    admin_audit_logs.created_at;
END;
$$;


--
-- Name: create_job(text, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_job(p_job_id text, p_job_type text, p_user_id integer, p_request_params jsonb) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO jobs (
    job_id,
    job_type,
    status,
    user_id,
    request_params
  )
  VALUES (
    p_job_id,
    p_job_type,
    'queued',
    p_user_id,
    COALESCE(p_request_params, '{}'::jsonb)
  )
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$;


--
-- Name: create_tour_reservation(integer, integer, text, text, bigint, text, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tour_reservation(p_tour_id integer, p_participants integer, p_customer_name text, p_customer_email text, p_conversation_id bigint, p_confirmation_code text, p_discount_rate numeric DEFAULT 0, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(success boolean, code text, message text, id integer, user_id integer, customer_name text, customer_email text, conversation_id text, tour_id integer, participants integer, confirmation_code text, created_at timestamp without time zone, total_price numeric, tour_name text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  selected_tour tours%ROWTYPE;
  inserted_reservation reservations%ROWTYPE;
  selected_conversation conversations%ROWTYPE;
  remaining_slots INTEGER;
  subtotal NUMERIC;
  discount_amount NUMERIC;
  calculated_total_price NUMERIC;
  tour_location TEXT;
  tour_node TEXT;
  tour_subnode TEXT;
  tour_zone TEXT;
BEGIN
  BEGIN
    SELECT c.*
    INTO selected_conversation
    FROM conversations AS c
    WHERE c.id = p_conversation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation id % was not found', p_conversation_id
        USING ERRCODE = '23503';
    END IF;

    IF selected_conversation.user_id IS NOT NULL AND p_user_id IS NOT NULL AND selected_conversation.user_id <> p_user_id THEN
      RAISE EXCEPTION 'conversation % is not owned by user %', p_conversation_id, p_user_id
        USING ERRCODE = '42501';
    END IF;

    SELECT t.*
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
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::INTEGER,
        NULL::TEXT;
      RETURN;
    END IF;

    SELECT
      COALESCE(parent_node.name || ' / ' || location_node.name, location_node.name, z.name),
      COALESCE(parent_node.name, location_node.name),
      CASE WHEN parent_node.id IS NULL THEN NULL ELSE location_node.name END,
      z.name
    INTO tour_location, tour_node, tour_subnode, tour_zone
    FROM node AS location_node
    JOIN zone AS z ON z.id = location_node.zone_id
    LEFT JOIN node AS parent_node ON parent_node.id = location_node.parent_id
    WHERE location_node.id = selected_tour.node_id;

    IF selected_tour.tour_type = 'scheduled' THEN
      RETURN QUERY
      SELECT false, 'TOUR_DATE_REQUIRED'::TEXT, 'Choose a tour date before booking.'::TEXT,
        NULL::INTEGER, NULL::INTEGER, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        selected_tour.id, p_participants, NULL::TEXT, NULL::TIMESTAMP, NULL::NUMERIC,
        selected_tour.name, selected_tour.price, selected_tour.available_slots,
        tour_location, tour_node, tour_subnode, tour_zone, selected_tour.duration_hours,
        selected_tour.difficulty;
      RETURN;
    END IF;

    IF selected_tour.max_participants < p_participants THEN
      RETURN QUERY
      SELECT
        false,
        'PARTICIPANT_LIMIT_EXCEEDED'::TEXT,
        format(
          '%s accepts at most %s participants, but %s were requested.',
          selected_tour.name,
          selected_tour.max_participants,
          p_participants
        )::TEXT,
        NULL::INTEGER,
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
        selected_tour.max_participants,
        tour_location,
        tour_node,
        tour_subnode,
        tour_zone,
        selected_tour.duration_hours,
        selected_tour.difficulty;
      RETURN;
    END IF;

    subtotal := selected_tour.price * p_participants;
    discount_amount := ROUND(subtotal * COALESCE(p_discount_rate, 0), 2);
    calculated_total_price := ROUND(subtotal - discount_amount, 2);

    remaining_slots := selected_tour.max_participants;

    INSERT INTO reservations (
      user_id,
      customer_name,
      customer_email,
      conversation_id,
      tour_id,
      participants,
      confirmation_code,
      total_price
    )
    VALUES (
      p_user_id,
      p_customer_name,
      p_customer_email,
      selected_conversation.id,
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
      inserted_reservation.user_id,
      inserted_reservation.customer_name,
      inserted_reservation.customer_email,
      selected_conversation.conversation_code,
      inserted_reservation.tour_id,
      inserted_reservation.participants,
      inserted_reservation.confirmation_code,
      inserted_reservation.created_at,
      inserted_reservation.total_price,
      selected_tour.name,
      selected_tour.price,
      remaining_slots,
      tour_location,
      tour_node,
      tour_subnode,
      tour_zone,
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


--
-- Name: create_tour_reservation_for_date(integer, date, integer, text, text, bigint, text, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tour_reservation_for_date(p_tour_id integer, p_tour_date date, p_participants integer, p_customer_name text, p_customer_email text, p_conversation_id bigint, p_confirmation_code text, p_discount_rate numeric DEFAULT 0, p_user_id integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  selected_tour tours%ROWTYPE;
  selected_occurrence tour_occurrences%ROWTYPE;
  inserted reservations%ROWTYPE;
  remaining INTEGER;
  price_each NUMERIC;
  violated_constraint TEXT;
BEGIN
  SELECT * INTO selected_tour FROM tours WHERE id = p_tour_id FOR UPDATE;
  IF NOT FOUND OR NOT selected_tour.is_active THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOUR_NOT_FOUND', 'message', 'The selected tour is unavailable.');
  END IF;
  IF p_tour_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOUR_DATE_REQUIRED', 'message', 'Choose a tour date before booking.');
  END IF;
  IF p_participants < 1 OR (selected_tour.tour_type = 'unscheduled'
    AND p_participants > selected_tour.max_participants) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARTICIPANT_LIMIT_EXCEEDED',
      'message', format('This tour accepts at most %s participants.', selected_tour.max_participants));
  END IF;
  IF EXISTS (SELECT 1 FROM reservations r WHERE r.tour_date = p_tour_date
    AND ((p_user_id IS NOT NULL AND r.user_id = p_user_id)
      OR (p_customer_email IS NOT NULL AND lower(r.customer_email) = lower(p_customer_email)))) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOUR_DAY_CONFLICT',
      'message', 'Only one tour may be reserved per itinerary day.');
  END IF;

  IF selected_tour.tour_type = 'scheduled' THEN
    IF selected_tour.start_date IS NULL OR
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::date >= selected_tour.start_date THEN
      RETURN jsonb_build_object('success', false, 'code', 'TOUR_DATE_UNAVAILABLE',
        'message', 'The scheduled tour has already started.');
    END IF;
    SELECT * INTO selected_occurrence FROM tour_occurrences o
    WHERE o.tour_id = p_tour_id
      AND (o.starts_at AT TIME ZONE 'America/Costa_Rica')::date = p_tour_date
    ORDER BY o.starts_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR selected_occurrence.status <> 'scheduled' OR selected_occurrence.starts_at <= CURRENT_TIMESTAMP THEN
      RETURN jsonb_build_object('success', false, 'code', 'TOUR_DATE_UNAVAILABLE', 'message', 'The selected tour is unavailable on that date.');
    END IF;
    IF selected_occurrence.remaining_spaces < p_participants THEN
      RETURN jsonb_build_object('success', false, 'code', 'INSUFFICIENT_AVAILABILITY',
        'message', 'There are not enough spaces for the selected date.', 'tour_available_slots', selected_occurrence.remaining_spaces);
    END IF;
    UPDATE tour_occurrences SET remaining_spaces = remaining_spaces - p_participants,
      updated_at = CURRENT_TIMESTAMP WHERE id = selected_occurrence.id
      RETURNING remaining_spaces INTO remaining;
  ELSE
    remaining := selected_tour.max_participants;
  END IF;

  price_each := GREATEST(selected_tour.minimum_price, selected_tour.price);
  INSERT INTO reservations (user_id, customer_name, customer_email, conversation_id,
    tour_id, participants, confirmation_code, total_price, tour_date, occurrence_id)
  VALUES (p_user_id, p_customer_name, p_customer_email, p_conversation_id,
    p_tour_id, p_participants, p_confirmation_code,
    round(price_each * p_participants * (1 - COALESCE(p_discount_rate, 0)), 2),
    p_tour_date, selected_occurrence.id)
  RETURNING * INTO inserted;

  RETURN jsonb_build_object('success', true, 'id', inserted.id, 'user_id', inserted.user_id,
    'customer_name', inserted.customer_name, 'customer_email', inserted.customer_email,
    'conversation_id', (SELECT conversation_code FROM conversations WHERE id = p_conversation_id),
    'tour_id', inserted.tour_id, 'tour_date', inserted.tour_date,
    'participants', inserted.participants, 'confirmation_code', inserted.confirmation_code,
    'created_at', inserted.created_at, 'total_price', inserted.total_price,
    'tour_name', selected_tour.name, 'tour_price', price_each,
    'tour_available_slots', remaining, 'tour_type', selected_tour.tour_type);
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
  IF violated_constraint IN ('idx_reservations_user_calendar_day', 'idx_reservations_email_calendar_day') THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOUR_DAY_CONFLICT',
      'message', 'Only one tour may be reserved per itinerary day.');
  END IF;
  RAISE;
END;
$$;


--
-- Name: delete_message_by_id(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_message_by_id(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM messages AS m
  WHERE m.id = p_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;


--
-- Name: delete_tour_cart_item(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_tour_cart_item(p_user_id integer, p_item_id integer) RETURNS boolean
    LANGUAGE sql
    AS $$
  WITH deleted AS (
    DELETE FROM tour_cart_items
    WHERE tour_cart_items.user_id = p_user_id AND tour_cart_items.id = p_item_id
    RETURNING tour_cart_items.id
  )
  SELECT EXISTS(SELECT 1 FROM deleted);
$$;


--
-- Name: delete_tour_cart_items_by_ids(integer, integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_tour_cart_items_by_ids(p_user_id integer, p_item_ids integer[]) RETURNS void
    LANGUAGE sql
    AS $$
  DELETE FROM tour_cart_items
  WHERE tour_cart_items.user_id = p_user_id
    AND tour_cart_items.id = ANY(p_item_ids);
$$;


--
-- Name: derive_tour_coordinates_from_node(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_tour_coordinates_from_node() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lat NUMERIC;
  v_lon NUMERIC;
BEGIN
  SELECT lat, lon INTO v_lat, v_lon FROM node WHERE id = NEW.node_id;
  IF v_lat IS NULL OR v_lon IS NULL THEN
    RAISE EXCEPTION 'Selected node requires coordinates'
      USING ERRCODE = '23514', CONSTRAINT = 'tour_node_coordinates_required';
  END IF;
  NEW.lat := v_lat;
  NEW.lon := v_lon;
  RETURN NEW;
END; $$;


--
-- Name: disable_ai_feature_by_admin(bigint, integer, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_ai_feature_by_admin(p_audit_id bigint, p_admin_user_id integer, p_feature text, p_disabled_until timestamp with time zone) RETURNS TABLE(feature text, disabled_until timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF p_disabled_until <= NOW() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DISABLE_WINDOW';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  INSERT INTO ai_feature_controls (feature, disabled_until, updated_by, updated_at)
  VALUES (p_feature, p_disabled_until, p_admin_user_id, NOW())
  ON CONFLICT ON CONSTRAINT ai_feature_controls_pkey DO UPDATE
  SET
    disabled_until = EXCLUDED.disabled_until,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded',
    'disabledUntil', p_disabled_until
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_feature, p_disabled_until;
END;
$$;


--
-- Name: enable_ai_feature_by_admin(bigint, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_ai_feature_by_admin(p_audit_id bigint, p_admin_user_id integer, p_feature text) RETURNS TABLE(feature text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  DELETE FROM ai_feature_controls AS controls
  WHERE controls.feature = p_feature;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded'
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_feature;
END;
$$;


--
-- Name: ensure_conversation(text, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_conversation(p_conversation_code text, p_user_id integer DEFAULT NULL::integer, p_title text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id bigint, conversation_code text, user_id integer, title text, last_message_at timestamp without time zone, metadata jsonb, created_at timestamp without time zone)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  INSERT INTO conversations AS c (conversation_code, user_id, title, metadata)
  VALUES (p_conversation_code, p_user_id, p_title, p_metadata)
  ON CONFLICT ON CONSTRAINT conversations_conversation_code_key DO UPDATE
  SET
    user_id = COALESCE(c.user_id, EXCLUDED.user_id),
    title = COALESCE(EXCLUDED.title, c.title),
    metadata = c.metadata || EXCLUDED.metadata
  RETURNING
    c.id,
    c.conversation_code,
    c.user_id,
    c.title,
    c.last_message_at,
    c.metadata,
    c.created_at;
END;
$$;


--
-- Name: ensure_free_user_subscription(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_free_user_subscription(p_user_id integer) RETURNS TABLE(user_id integer, plan_id integer, plan_name text, status text)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fail_job(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_job(p_job_id text, p_error_message text) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'failed',
    error_message = p_error_message,
    updated_at = NOW(),
    completed_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$;


--
-- Name: finalize_admin_audit_log(bigint, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_admin_audit_log(p_audit_id bigint, p_admin_user_id integer, p_metadata jsonb) RETURNS TABLE(id bigint, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || COALESCE(p_metadata, '{}'::jsonb)
  WHERE admin_audit_logs.id = p_audit_id
    AND admin_audit_logs.admin_user_id = p_admin_user_id
  RETURNING admin_audit_logs.id, admin_audit_logs.metadata;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: get_active_user_memories(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_user_memories(p_user_id bigint, p_limit integer DEFAULT 50) RETURNS SETOF public.user_memories
    LANGUAGE sql
    AS $$
  SELECT um.*
  FROM user_memories AS um
  WHERE um.user_id = p_user_id
    AND um.is_active = TRUE
    AND (um.expires_at IS NULL OR um.expires_at > CURRENT_TIMESTAMP)
  ORDER BY um.confidence DESC, um.created_at DESC, um.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;


--
-- Name: get_admin_billing_dashboard(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_billing_dashboard(p_month_start timestamp with time zone DEFAULT date_trunc('month'::text, now())) RETURNS TABLE(monthly_revenue numeric, mrr numeric, arr numeric, active_subscriptions integer, cancelled_subscriptions integer, revenue_by_plan jsonb)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_ai_feature_economics(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ai_feature_economics(p_granularity text, p_start_at timestamp with time zone, p_end_at timestamp with time zone) RETURNS TABLE(bucket_start timestamp with time zone, feature text, feature_usage bigint, tokens bigint, ai_cost numeric, allocated_subscription_revenue numeric, subscription_revenue numeric)
    LANGUAGE plpgsql STABLE
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


--
-- Name: get_all_messages(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_messages(p_offset integer DEFAULT 0, p_limit integer DEFAULT 100) RETURNS TABLE(id bigint, conversation_id bigint, conversation_code text, user_input text, ai_output text, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT m.id, m.conversation_id, c.conversation_code, m.user_input, m.ai_output, m.created_at
  FROM messages AS m
  JOIN conversations AS c ON c.id = m.conversation_id
  ORDER BY m.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;


--
-- Name: get_available_tours(text, text, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_available_tours(p_location text DEFAULT NULL::text, p_difficulty text DEFAULT NULL::text, p_max_price numeric DEFAULT NULL::numeric, p_min_slots integer DEFAULT 1) RETURNS TABLE(id integer, country text, name text, description text, price numeric, available_slots integer, location text, node text, subnode text, zone text, rank integer, lat numeric, lon numeric, start_date date, end_date date, birds jsonb, duration_hours integer, difficulty text, tour_type text, is_active boolean, max_participants integer, minimum_price numeric, occurrence_dates jsonb)
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


--
-- Name: get_conversation_messages(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_messages(p_conversation_code text, p_limit integer DEFAULT 100, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(id bigint, conversation_id bigint, conversation_code text, user_input text, ai_output text, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT m.id, m.conversation_id, c.conversation_code, m.user_input, m.ai_output, m.created_at
  FROM messages AS m
  INNER JOIN conversations AS c ON c.id = m.conversation_id
  WHERE c.conversation_code = p_conversation_code
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
  ORDER BY m.created_at ASC
  LIMIT p_limit;
$$;


--
-- Name: get_conversation_messages_for_compaction(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_messages_for_compaction(p_conversation_code text, p_limit integer DEFAULT 200, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(id bigint, conversation_id bigint, conversation_code text, user_input text, ai_output text, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT
    recent.id,
    recent.conversation_id,
    recent.conversation_code,
    recent.user_input,
    recent.ai_output,
    recent.created_at
  FROM (
    SELECT
      m.id,
      m.conversation_id,
      c.conversation_code,
      m.user_input,
      m.ai_output,
      m.created_at
    FROM messages AS m
    INNER JOIN conversations AS c ON c.id = m.conversation_id
    WHERE c.conversation_code = p_conversation_code
      AND (
        (p_user_id IS NULL AND c.user_id IS NULL)
        OR c.user_id = p_user_id
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT GREATEST(p_limit, 1)
  ) AS recent
  ORDER BY recent.created_at ASC, recent.id ASC;
$$;


--
-- Name: get_default_plan_provider_mapping(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_default_plan_provider_mapping(p_plan_name text, p_provider text) RETURNS TABLE(provider_mapping_id integer, plan_id integer, plan_name text, provider text, provider_product_id text, provider_price_id text, provider_sku text, is_default boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    provider_mappings.id,
    plans.id,
    plans.name,
    provider_mappings.provider,
    provider_mappings.provider_product_id,
    provider_mappings.provider_price_id,
    provider_mappings.provider_sku,
    plan_provider_mappings.is_default
  FROM plan_provider_mappings
  INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
  INNER JOIN plans ON plans.id = plan_provider_mappings.plan_id
  WHERE plans.name = p_plan_name
    AND provider_mappings.provider = p_provider
    AND plan_provider_mappings.is_default = TRUE
  ORDER BY plan_provider_mappings.provider_mapping_id
  LIMIT 1;
END;
$$;


--
-- Name: get_default_tour_provider_mapping(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_default_tour_provider_mapping(p_tour_id integer, p_provider text) RETURNS TABLE(provider_mapping_id integer, tour_id integer, tour_name text, provider text, provider_product_id text, provider_price_id text, provider_sku text, is_default boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    provider_mappings.id,
    tours.id,
    tours.name,
    provider_mappings.provider,
    provider_mappings.provider_product_id,
    provider_mappings.provider_price_id,
    provider_mappings.provider_sku,
    tour_provider_mappings.is_default
  FROM tour_provider_mappings
  INNER JOIN provider_mappings ON provider_mappings.id = tour_provider_mappings.provider_mapping_id
  INNER JOIN tours ON tours.id = tour_provider_mappings.tour_id
  WHERE tours.id = p_tour_id
    AND provider_mappings.provider = p_provider
    AND tour_provider_mappings.is_default = TRUE
  ORDER BY tour_provider_mappings.provider_mapping_id
  LIMIT 1;
END;
$$;


--
-- Name: get_job(text, integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_job(p_job_id text, p_user_id integer, p_job_type text DEFAULT NULL::text, p_allow_public boolean DEFAULT false) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at
  FROM jobs
  WHERE jobs.job_id = p_job_id
    AND (p_job_type IS NULL OR jobs.job_type = p_job_type)
    AND (
      jobs.user_id = p_user_id
      OR (p_allow_public IS TRUE AND jobs.user_id IS NULL)
    );
END;
$$;


--
-- Name: get_job_for_processing(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_job_for_processing(p_job_id text, p_job_type text DEFAULT NULL::text) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at
  FROM jobs
  WHERE jobs.job_id = p_job_id
    AND (p_job_type IS NULL OR jobs.job_type = p_job_type);
END;
$$;


--
-- Name: get_last_messages(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_last_messages(p_conversation_code text, p_limit integer DEFAULT 10, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(conversation_id bigint, conversation_code text, user_input text, ai_output text, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT recent.conversation_id, recent.conversation_code, recent.user_input, recent.ai_output, recent.created_at
  FROM (
    SELECT m.conversation_id, c.conversation_code, m.user_input, m.ai_output, m.created_at
    FROM messages AS m
    INNER JOIN conversations AS c ON c.id = m.conversation_id
    WHERE c.conversation_code = p_conversation_code
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) AS recent
  ORDER BY recent.created_at ASC;
$$;


--
-- Name: get_latest_conversation_summary(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_latest_conversation_summary(p_conversation_code text, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(id bigint, conversation_id bigint, version integer, schema_version text, summary jsonb, compacted_message_ids bigint[], source_token_count integer, previous_summary_version integer, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT
    cs.id,
    cs.conversation_id,
    cs.version,
    cs.schema_version,
    cs.summary,
    cs.compacted_message_ids,
    cs.source_token_count,
    cs.previous_summary_version,
    cs.created_at
  FROM conversation_summaries AS cs
  INNER JOIN conversations AS c ON c.id = cs.conversation_id
  WHERE c.conversation_code = p_conversation_code
    AND (
      (p_user_id IS NULL AND c.user_id IS NULL)
      OR c.user_id = p_user_id
    )
  ORDER BY cs.version DESC
  LIMIT 1;
$$;


--
-- Name: get_monthly_billing_usage_dashboard(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_billing_usage_dashboard(p_user_id integer, p_month_start timestamp with time zone DEFAULT date_trunc('month'::text, now())) RETURNS TABLE(monthly_cost numeric, monthly_requests integer, monthly_tokens integer, plan_name text, subscription_status text, billing_provider text, has_provider_subscription boolean, provider_revenue numeric, gross_profit numeric, gross_margin_percent numeric, langsmith_trace_count integer, usage_by_feature jsonb)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_monthly_usage_dashboard(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_usage_dashboard(p_user_id integer, p_month_start timestamp with time zone DEFAULT date_trunc('month'::text, now())) RETURNS TABLE(monthly_cost numeric, monthly_requests integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(usage_events.estimated_cost), 0)::NUMERIC,
    COUNT(*)::INTEGER
  FROM usage_events
  WHERE usage_events.user_id = p_user_id
    AND usage_events.created_at >= p_month_start
    AND usage_events.created_at < p_month_start + INTERVAL '1 month';
END;
$$;


--
-- Name: get_reservation_conversation_state(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reservation_conversation_state(p_conversation_code text, p_user_id integer DEFAULT NULL::integer) RETURNS TABLE(conversation_id bigint, version integer, status text, proposed_values jsonb, confirmed_values jsonb, reservation_id integer, booking_idempotency_key text, created_at timestamp without time zone, updated_at timestamp without time zone)
    LANGUAGE sql
    AS $$
  SELECT
    rs.conversation_id,
    rs.version,
    rs.status,
    rs.proposed_values,
    rs.confirmed_values,
    rs.reservation_id,
    rs.booking_idempotency_key,
    rs.created_at,
    rs.updated_at
  FROM reservation_conversation_states AS rs
  INNER JOIN conversations AS c ON c.id = rs.conversation_id
  WHERE c.conversation_code = p_conversation_code
    AND ((p_user_id IS NULL AND c.user_id IS NULL) OR c.user_id = p_user_id)
  LIMIT 1;
$$;


--
-- Name: get_tour_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tour_by_id(p_tour_id integer) RETURNS TABLE(id integer, country text, name text, description text, price numeric, available_slots integer, location text, node text, subnode text, zone text, rank integer, lat numeric, lon numeric, start_date date, end_date date, birds jsonb, duration_hours integer, difficulty text, tour_type text, is_active boolean, max_participants integer, minimum_price numeric, occurrence_dates jsonb)
    LANGUAGE sql
    AS $$
  SELECT
    t.id, c.acr::TEXT, t.name, t.description, t.price,
    CASE WHEN t.tour_type = 'scheduled' THEN COALESCE((
      SELECT MAX(o.remaining_spaces) FROM tour_occurrences o
      WHERE o.tour_id = t.id AND o.status = 'scheduled' AND o.starts_at > CURRENT_TIMESTAMP
    ), 0) ELSE t.max_participants END,
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name),
    COALESCE(parent_node.name, tour_node.name),
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END,
    z.name, tour_node.rank,
    COALESCE(t.lat, tour_node.lat, parent_node.lat),
    COALESCE(t.lon, tour_node.lon, parent_node.lon), t.start_date, t.end_date,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('species_code', b.species_code, 'name', b.name)
      ORDER BY bbn.rank, b.name) FROM birds_by_node bbn JOIN birds b ON b.id = bbn.bird_id
      WHERE bbn.node_id = tour_node.id AND bbn.is_active AND b.is_active), '[]'::jsonb),
    t.duration_hours, t.difficulty, t.tour_type, t.is_active, t.max_participants,
    t.minimum_price,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'occurrenceId', o.id, 'startsAt', o.starts_at, 'date',
      (o.starts_at AT TIME ZONE 'America/Costa_Rica')::date,
      'remainingSpaces', o.remaining_spaces, 'status', o.status
    ) ORDER BY o.starts_at) FROM tour_occurrences o
      WHERE o.tour_id = t.id AND o.status = 'scheduled'
        AND o.starts_at > CURRENT_TIMESTAMP AND o.remaining_spaces > 0), '[]'::jsonb)
  FROM tours t
  JOIN node tour_node ON tour_node.id = t.node_id
  JOIN zone z ON z.id = tour_node.zone_id
  JOIN country c ON c.id = z.country_id
  LEFT JOIN node parent_node ON parent_node.id = tour_node.parent_id
  WHERE t.id = p_tour_id;
$$;


--
-- Name: get_tour_by_id_rows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tour_by_id_rows() RETURNS TABLE(id integer, country text, name text, description text, price numeric, available_slots integer, location text, node text, subnode text, zone text, rank integer, lat numeric, lon numeric, start_date date, end_date date, birds jsonb, duration_hours integer, difficulty text, tour_type text, is_active boolean, max_participants integer, minimum_price numeric, occurrence_dates jsonb)
    LANGUAGE sql
    AS $$
  SELECT details.* FROM tours t CROSS JOIN LATERAL get_tour_by_id(t.id) details;
$$;


--
-- Name: get_tour_cart_item_by_id(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tour_cart_item_by_id(p_user_id integer, p_item_id integer) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE sql
    AS $$
  SELECT *
  FROM get_tour_cart_items(p_user_id) AS item
  WHERE item.id = p_item_id;
$$;


--
-- Name: get_tour_cart_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tour_cart_items(p_user_id integer) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE sql
    AS $$
  SELECT
    i.id,
    i.user_id,
    i.tour_id,
    i.scheduled_date,
    i.participants,
    i.needs_transfer,
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


--
-- Name: get_user_experiment_assignment(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_experiment_assignment(p_user_id integer, p_experiment_key text) RETURNS TABLE(experiment_key text, variant text, assigned_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    assignment.experiment_key,
    assignment.variant,
    assignment.assigned_at
  FROM experiment_assignments AS assignment
  WHERE assignment.user_id = p_user_id
    AND assignment.experiment_key = p_experiment_key
  LIMIT 1;
$$;


--
-- Name: get_user_memory_history(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_memory_history(p_user_id bigint, p_limit integer DEFAULT 100) RETURNS SETOF public.user_memories
    LANGUAGE sql
    AS $$
  SELECT um.*
  FROM user_memories AS um
  WHERE um.user_id = p_user_id
  ORDER BY um.created_at DESC, um.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;


--
-- Name: get_user_subscription_plan(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_subscription_plan(p_user_id integer) RETURNS TABLE(user_id integer, plan_id integer, plan_name text, status text, max_chats integer, max_identifications integer, billing_provider text, provider_customer_id text, provider_subscription_id text, provider_price_id text, current_period_end timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    user_subscriptions.user_id,
    plans.id,
    plans.name,
    user_subscriptions.status,
    plans.max_chats,
    plans.max_identifications,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end
  FROM user_subscriptions
  INNER JOIN plans ON plans.id = user_subscriptions.plan_id
  WHERE user_subscriptions.user_id = p_user_id
  LIMIT 1;
END;
$$;


--
-- Name: mark_billing_provider_event_processed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_billing_provider_event_processed(p_provider text, p_provider_event_id text) RETURNS TABLE(id bigint, provider text, provider_event_id text, event_type text, event_name text, provider_object_id text, provider_customer_id text, provider_subscription_id text, provider_invoice_id text, status text, event_data jsonb, processed_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_events
  SET processed_at = COALESCE(billing_events.processed_at, NOW())
  WHERE billing_events.provider = p_provider
    AND billing_events.provider_event_id = p_provider_event_id
  RETURNING
    billing_events.id,
    billing_events.provider,
    billing_events.provider_event_id,
    billing_events.event_type,
    billing_events.event_name,
    billing_events.provider_object_id,
    billing_events.provider_customer_id,
    billing_events.provider_subscription_id,
    billing_events.provider_invoice_id,
    billing_events.status,
    billing_events.event_data,
    billing_events.processed_at,
    billing_events.created_at;
END;
$$;


--
-- Name: mark_job_active(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_job_active(p_job_id text) RETURNS TABLE(job_id text, job_type text, status text, user_id integer, request_params jsonb, result jsonb, result_meta jsonb, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status = 'active',
    updated_at = NOW()
  WHERE jobs.job_id = p_job_id
  RETURNING
    jobs.job_id,
    jobs.job_type,
    jobs.status,
    jobs.user_id,
    jobs.request_params,
    jobs.result,
    jobs.result_meta,
    jobs.error_message,
    jobs.created_at,
    jobs.updated_at,
    jobs.completed_at;
END;
$$;

--
-- Name: mutate_reservation_conversation_state(text, integer, integer, jsonb, jsonb, text, text, text[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mutate_reservation_conversation_state(p_conversation_code text, p_user_id integer, p_expected_version integer, p_proposed_values jsonb, p_confirmed_values jsonb, p_status text, p_event_type text, p_changed_fields text[], p_source_type text, p_source_id text DEFAULT NULL::text) RETURNS SETOF public.reservation_conversation_states
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  conversation_row conversations%ROWTYPE;
  state_row reservation_conversation_states%ROWTYPE;
  next_state reservation_conversation_states%ROWTYPE;
BEGIN
  IF p_status NOT IN ('collecting_information', 'ready_for_confirmation', 'cancelled') THEN
    RAISE EXCEPTION 'invalid reservation state transition target'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO conversation_row
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM ensure_conversation(p_conversation_code, p_user_id);
    SELECT c.* INTO conversation_row
    FROM conversations AS c
    WHERE c.conversation_code = p_conversation_code
    FOR UPDATE;
  END IF;

  IF conversation_row.user_id IS NOT NULL
    AND (p_user_id IS NULL OR conversation_row.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO reservation_conversation_states AS rs (conversation_id)
  VALUES (conversation_row.id)
  ON CONFLICT (conversation_id) DO NOTHING;

  SELECT rs.* INTO state_row
  FROM reservation_conversation_states AS rs
  WHERE rs.conversation_id = conversation_row.id
  FOR UPDATE;

  IF state_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'reservation state version conflict' USING ERRCODE = '40001';
  END IF;

  IF p_status = 'cancelled' AND state_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'only confirmed reservation state can be cancelled' USING ERRCODE = '22023';
  END IF;

  IF state_row.status = 'collecting_information'
    AND p_status NOT IN ('collecting_information', 'ready_for_confirmation') THEN
    RAISE EXCEPTION 'invalid reservation state transition' USING ERRCODE = '22023';
  END IF;

  IF state_row.status = 'ready_for_confirmation'
    AND p_status NOT IN ('collecting_information', 'ready_for_confirmation') THEN
    RAISE EXCEPTION 'invalid reservation state transition' USING ERRCODE = '22023';
  END IF;

  IF state_row.status = 'confirmed' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'confirmed reservation state can only be cancelled' USING ERRCODE = '22023';
  END IF;

  IF state_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled reservation state is terminal' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'ready_for_confirmation' AND (
    COALESCE(p_proposed_values, '{}'::jsonb) <> '{}'::jsonb
    OR NOT (jsonb_strip_nulls(COALESCE(p_confirmed_values, '{}'::jsonb)) ?& ARRAY[
      'tourId', 'date', 'participants', 'transferRequired',
      'customerName', 'customerEmail', 'itineraryStartDate', 'itineraryEndDate'
    ])
    OR (p_confirmed_values->>'tourId')::INTEGER <= 0
    OR (p_confirmed_values->>'participants')::INTEGER <= 0
    OR (p_confirmed_values->>'transferRequired')::BOOLEAN IS NULL
    OR ((p_confirmed_values->>'transferRequired')::BOOLEAN = TRUE
      AND NULLIF(BTRIM(p_confirmed_values->>'pickupLocation'), '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'reservation state is not ready for confirmation' USING ERRCODE = '22023';
  END IF;

  UPDATE reservation_conversation_states AS rs
  SET
    version = state_row.version + 1,
    status = p_status,
    proposed_values = COALESCE(p_proposed_values, '{}'::jsonb),
    confirmed_values = COALESCE(p_confirmed_values, '{}'::jsonb),
    updated_at = CURRENT_TIMESTAMP
  WHERE rs.conversation_id = state_row.conversation_id
  RETURNING rs.* INTO next_state;

  INSERT INTO reservation_state_audit_events (
    conversation_id,
    previous_version,
    new_version,
    event_type,
    changed_fields,
    previous_values,
    resulting_values,
    confirmation_state,
    source_type,
    source_id
  ) VALUES (
    state_row.conversation_id,
    state_row.version,
    next_state.version,
    p_event_type,
    COALESCE(p_changed_fields, ARRAY[]::TEXT[]),
    jsonb_build_object(
      'status', state_row.status,
      'proposed', state_row.proposed_values - ARRAY['customerName', 'customerEmail'],
      'confirmed', state_row.confirmed_values - ARRAY['customerName', 'customerEmail']
    ),
    jsonb_build_object(
      'status', next_state.status,
      'proposed', next_state.proposed_values - ARRAY['customerName', 'customerEmail'],
      'confirmed', next_state.confirmed_values - ARRAY['customerName', 'customerEmail']
    ),
    jsonb_build_object(
      'status', next_state.status,
      'hasProposedValues', next_state.proposed_values <> '{}'::jsonb
    ),
    p_source_type,
    p_source_id
  );

  RETURN NEXT next_state;
END;
$$;


--
-- Name: normalize_search_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_search_text(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT lower(translate(
    COALESCE(p_value, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
  ));
$$;


--
-- Name: propagate_node_coordinates_to_tours(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propagate_node_coordinates_to_tours() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lon IS DISTINCT FROM OLD.lon THEN
    UPDATE tours SET lat = NEW.lat, lon = NEW.lon, updated_at = CURRENT_TIMESTAMP
    WHERE node_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: record_billing_provider_event(text, text, text, text, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_billing_provider_event(p_provider text, p_provider_event_id text, p_event_type text, p_event_name text, p_provider_object_id text DEFAULT NULL::text, p_provider_customer_id text DEFAULT NULL::text, p_provider_subscription_id text DEFAULT NULL::text, p_provider_invoice_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_event_data jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id bigint, provider text, provider_event_id text, event_type text, event_name text, provider_object_id text, provider_customer_id text, provider_subscription_id text, provider_invoice_id text, status text, event_data jsonb, processed_at timestamp with time zone, created_at timestamp with time zone, inserted boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH inserted_event AS (
    INSERT INTO billing_events (
      provider,
      provider_event_id,
      event_type,
      event_name,
      provider_object_id,
      provider_customer_id,
      provider_subscription_id,
      provider_invoice_id,
      status,
      event_data
    )
    VALUES (
      p_provider,
      p_provider_event_id,
      p_event_type,
      p_event_name,
      p_provider_object_id,
      p_provider_customer_id,
      p_provider_subscription_id,
      p_provider_invoice_id,
      p_status,
      COALESCE(p_event_data, '{}'::jsonb)
    )
    ON CONFLICT ON CONSTRAINT billing_events_provider_provider_event_id_key DO NOTHING
    RETURNING billing_events.*, TRUE AS inserted
  ),
  existing_event AS (
    SELECT billing_events.*, FALSE AS inserted
    FROM billing_events
    WHERE billing_events.provider = p_provider
      AND billing_events.provider_event_id = p_provider_event_id
      AND NOT EXISTS (SELECT 1 FROM inserted_event)
    LIMIT 1
  )
  SELECT
    event_row.id,
    event_row.provider,
    event_row.provider_event_id,
    event_row.event_type,
    event_row.event_name,
    event_row.provider_object_id,
    event_row.provider_customer_id,
    event_row.provider_subscription_id,
    event_row.provider_invoice_id,
    event_row.status,
    event_row.event_data,
    event_row.processed_at,
    event_row.created_at,
    event_row.inserted
  FROM (
    SELECT * FROM inserted_event
    UNION ALL
    SELECT * FROM existing_event
  ) AS event_row
  LIMIT 1;
END;
$$;


--
-- Name: record_usage_event(integer, text, integer, numeric, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_usage_event(p_user_id integer, p_feature text, p_tokens integer DEFAULT 0, p_estimated_cost numeric DEFAULT NULL::numeric, p_trace_id text DEFAULT NULL::text, p_model_usage jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(id bigint, user_id integer, feature text, tokens integer, estimated_cost numeric, trace_id text, model_usage jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO usage_events (
    user_id,
    feature,
    tokens,
    estimated_cost,
    trace_id,
    model_usage
  )
  VALUES (
    p_user_id,
    p_feature,
    GREATEST(COALESCE(p_tokens, 0), 0),
    p_estimated_cost,
    p_trace_id,
    COALESCE(p_model_usage, '[]'::jsonb)
  )
  RETURNING
    usage_events.id,
    usage_events.user_id,
    usage_events.feature,
    usage_events.tokens,
    usage_events.estimated_cost,
    usage_events.trace_id,
    usage_events.model_usage,
    usage_events.created_at;
END;
$$;


--
-- Name: reserve_daily_usage(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_daily_usage(p_user_id integer, p_feature text) RETURNS TABLE(allowed boolean, usage_event_id bigint, plan_name text, feature text, used integer, max_allowed integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  subscription RECORD;
  free_plan RECORD;
  current_used INTEGER;
  feature_limit INTEGER;
  reserved_usage_event_id BIGINT;
BEGIN
  IF p_feature NOT IN ('chat', 'identification') THEN
    RAISE EXCEPTION 'Unsupported quota feature: %', p_feature;
  END IF;

  PERFORM pg_advisory_xact_lock(
    p_user_id,
    CASE WHEN p_feature = 'chat' THEN 1 ELSE 2 END
  );

  SELECT *
  INTO subscription
  FROM get_user_subscription_plan(p_user_id);

  IF subscription.user_id IS NULL THEN
    SELECT *
    INTO subscription
    FROM ensure_free_user_subscription(p_user_id);

    SELECT *
    INTO subscription
    FROM get_user_subscription_plan(p_user_id);
  END IF;

  IF subscription.status NOT IN ('active', 'trialing', 'past_due') THEN
    SELECT plans.name, plans.max_chats, plans.max_identifications
    INTO free_plan
    FROM plans
    WHERE plans.name = 'FREE'
    LIMIT 1;

    subscription.plan_name := free_plan.name;
    subscription.max_chats := free_plan.max_chats;
    subscription.max_identifications := free_plan.max_identifications;
  END IF;

  feature_limit := CASE
    WHEN p_feature = 'chat' THEN subscription.max_chats
    ELSE subscription.max_identifications
  END;

  SELECT COUNT(*)::INTEGER
  INTO current_used
  FROM usage_events
  WHERE usage_events.user_id = p_user_id
    AND usage_events.feature = p_feature
    AND usage_events.created_at >= date_trunc('day', NOW());

  IF current_used >= feature_limit THEN
    RETURN QUERY SELECT FALSE, NULL::BIGINT, subscription.plan_name, p_feature, current_used, feature_limit;
    RETURN;
  END IF;

  INSERT INTO usage_events (user_id, feature)
  VALUES (p_user_id, p_feature)
  RETURNING id INTO reserved_usage_event_id;

  RETURN QUERY SELECT TRUE, reserved_usage_event_id, subscription.plan_name, p_feature, current_used + 1, feature_limit;
END;
$$;


--
-- Name: save_bird_identification(integer, text, text, numeric, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_bird_identification(p_user_id integer, p_image_url text, p_prediction text, p_confidence numeric, p_result jsonb, p_result_meta jsonb) RETURNS TABLE(id integer, user_id integer, image_url text, prediction text, confidence numeric, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO bird_identifications (
    user_id,
    image_url,
    prediction,
    confidence,
    result,
    result_meta,
    completed_at
  )
  VALUES (
    p_user_id,
    p_image_url,
    p_prediction,
    p_confidence,
    p_result,
    COALESCE(p_result_meta, '{}'::jsonb),
    NOW()
  )
  RETURNING
    bird_identifications.id,
    bird_identifications.user_id,
    bird_identifications.image_url,
    bird_identifications.prediction,
    bird_identifications.confidence,
    bird_identifications.created_at;
END;
$$;


--
-- Name: save_conversation_summary(text, integer, integer, text, jsonb, bigint[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_conversation_summary(p_conversation_code text, p_user_id integer, p_expected_previous_version integer, p_schema_version text, p_summary jsonb, p_compacted_message_ids bigint[], p_source_token_count integer) RETURNS TABLE(id bigint, conversation_id bigint, version integer, schema_version text, summary jsonb, compacted_message_ids bigint[], source_token_count integer, previous_summary_version integer, created_at timestamp without time zone)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  conversation_row conversations%ROWTYPE;
  current_version INTEGER;
BEGIN
  SELECT c.*
  INTO conversation_row
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF conversation_row.user_id IS NOT NULL
    AND (p_user_id IS NULL OR conversation_row.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'conversation not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT MAX(cs.version)
  INTO current_version
  FROM conversation_summaries AS cs
  WHERE cs.conversation_id = conversation_row.id;

  IF current_version IS DISTINCT FROM p_expected_previous_version THEN
    RAISE EXCEPTION 'conversation summary version conflict'
      USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  INSERT INTO conversation_summaries AS cs (
    conversation_id,
    version,
    schema_version,
    summary,
    compacted_message_ids,
    source_token_count,
    previous_summary_version
  ) VALUES (
    conversation_row.id,
    COALESCE(current_version, 0) + 1,
    p_schema_version,
    p_summary,
    COALESCE(p_compacted_message_ids, ARRAY[]::BIGINT[]),
    GREATEST(COALESCE(p_source_token_count, 0), 0),
    current_version
  )
  RETURNING
    cs.id,
    cs.conversation_id,
    cs.version,
    cs.schema_version,
    cs.summary,
    cs.compacted_message_ids,
    cs.source_token_count,
    cs.previous_summary_version,
    cs.created_at;
END;
$$;


--
-- Name: save_message(text, text, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_message(p_conversation_code text, p_user_input text, p_ai_output text, p_user_id integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id bigint, conversation_id bigint, conversation_code text, user_input text, ai_output text, created_at timestamp without time zone)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  existing_user_id INTEGER;
BEGIN
  SELECT c.user_id
  INTO existing_user_id
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code;

  IF existing_user_id IS NOT NULL AND p_user_id IS NOT NULL AND existing_user_id <> p_user_id THEN
    RAISE EXCEPTION 'conversation % is not owned by user %', p_conversation_code, p_user_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH conversation_row AS (
    INSERT INTO conversations AS c (
      conversation_code,
      user_id,
      metadata,
      last_message_at
    )
    VALUES (
      p_conversation_code,
      p_user_id,
      COALESCE(p_metadata, '{}'::jsonb),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT conversations_conversation_code_key DO UPDATE
    SET
      user_id = COALESCE(c.user_id, EXCLUDED.user_id),
      metadata = COALESCE(c.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      last_message_at = CURRENT_TIMESTAMP
    RETURNING c.id, c.conversation_code
  ), inserted_message AS (
    INSERT INTO messages AS m (conversation_id, user_input, ai_output)
    SELECT cr.id, p_user_input, p_ai_output
    FROM conversation_row AS cr
    RETURNING
      m.id,
      m.conversation_id,
      m.user_input,
      m.ai_output,
      m.created_at
  )
  SELECT
    im.id,
    im.conversation_id,
    cr.conversation_code,
    im.user_input,
    im.ai_output,
    im.created_at
  FROM inserted_message AS im
  JOIN conversation_row AS cr ON cr.id = im.conversation_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'save_chat_message failed for conversation_code %: %',
      p_conversation_code,
      SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;



--
-- Name: save_user_memory_v2(bigint, text, text, text, numeric, bigint, timestamp with time zone, boolean, text, text, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_user_memory_v2(p_user_id bigint, p_category text, p_content text, p_content_fingerprint text, p_confidence numeric, p_source_message_id bigint, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_user_editable boolean DEFAULT true, p_conflict_key text DEFAULT NULL::text, p_resolution text DEFAULT 'none'::text, p_superseded_memory_ids bigint[] DEFAULT ARRAY[]::bigint[]) RETURNS SETOF public.user_memories
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
  source_owner_id BIGINT;
  superseded_count INTEGER;
  inserted_memory user_memories%ROWTYPE;
  normalized_superseded_ids BIGINT[] := COALESCE(p_superseded_memory_ids, ARRAY[]::BIGINT[]);
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  SELECT c.user_id
  INTO source_owner_id
  FROM messages AS m
  INNER JOIN conversations AS c ON c.id = m.conversation_id
  WHERE m.id = p_source_message_id;

  IF source_owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'memory source message is not owned by user'
      USING ERRCODE = '42501';
  END IF;

  IF p_resolution NOT IN ('none', 'explicit_recent_correction') THEN
    RAISE EXCEPTION 'invalid memory conflict resolution'
      USING ERRCODE = '22023';
  END IF;

  IF (CARDINALITY(normalized_superseded_ids) > 0)
    IS DISTINCT FROM (p_resolution = 'explicit_recent_correction') THEN
    RAISE EXCEPTION 'supersession requires explicit recent correction'
      USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO superseded_count
  FROM user_memories AS um
  WHERE um.id = ANY(normalized_superseded_ids)
    AND um.user_id = p_user_id
    AND um.category = p_category
    AND um.is_active = TRUE
    AND (
      p_conflict_key IS NULL
      OR um.conflict_key IS NULL
      OR um.conflict_key = p_conflict_key
    );

  IF superseded_count <> CARDINALITY(normalized_superseded_ids) THEN
    RAISE EXCEPTION 'invalid memories selected for supersession'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO user_memories AS um (
    user_id,
    category,
    content,
    content_fingerprint,
    confidence,
    source_message_id,
    expires_at,
    is_user_editable,
    conflict_key,
    resolution
  ) VALUES (
    p_user_id,
    p_category,
    BTRIM(p_content),
    p_content_fingerprint,
    p_confidence,
    p_source_message_id,
    p_expires_at,
    COALESCE(p_is_user_editable, TRUE),
    NULLIF(BTRIM(p_conflict_key), ''),
    p_resolution
  )
  ON CONFLICT (user_id, category, content_fingerprint) WHERE is_active = TRUE
  DO NOTHING
  RETURNING um.* INTO inserted_memory;

  IF inserted_memory.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE user_memories AS um
  SET
    is_active = FALSE,
    superseded_by_id = inserted_memory.id,
    superseded_at = CURRENT_TIMESTAMP,
    resolution = 'explicit_recent_correction'
  WHERE um.id = ANY(normalized_superseded_ids);

  RETURN NEXT inserted_memory;
END;
$$;


--
-- Name: select_tour(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.select_tour(p_tour_id integer, p_participants integer DEFAULT 1) RETURNS TABLE(success boolean, code text, message text, id integer, name text, price numeric, available_slots integer, location text, node text, subnode text, zone text, duration_hours integer, difficulty text)
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
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS location,
    COALESCE(parent_node.name, tour_node.name) AS node,
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END AS subnode,
    z.name AS zone,
    t.duration_hours,
    t.difficulty
  FROM (SELECT 1) AS seed
  LEFT JOIN tours AS t ON t.id = p_tour_id
  LEFT JOIN node AS tour_node ON tour_node.id = t.node_id
  LEFT JOIN zone AS z ON z.id = tour_node.zone_id
  LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: suspend_user_by_admin(bigint, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suspend_user_by_admin(p_audit_id bigint, p_admin_user_id integer, p_target_user_id integer, p_reason_code text) RETURNS TABLE(user_id integer, suspended_at timestamp with time zone, reason_code text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_target_role TEXT;
  v_suspended_at TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  SELECT users.role INTO v_target_role
  FROM users
  WHERE users.id = p_target_user_id
  FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_USER_NOT_FOUND';
  END IF;

  IF p_target_user_id = p_admin_user_id OR v_target_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_USER_SUSPENSION_FORBIDDEN';
  END IF;

  UPDATE users
  SET
    suspended_at = v_suspended_at,
    suspended_by = p_admin_user_id,
    suspension_reason_code = p_reason_code,
    updated_at = v_suspended_at
  WHERE users.id = p_target_user_id;

  UPDATE refresh_tokens
  SET revoked_at = v_suspended_at
  WHERE refresh_tokens.user_id = p_target_user_id
    AND refresh_tokens.revoked_at IS NULL;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded',
    'reasonCode', p_reason_code
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_target_user_id, v_suspended_at, p_reason_code;
END;
$$;



--
-- Name: unsuspend_user_by_admin(bigint, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsuspend_user_by_admin(p_audit_id bigint, p_admin_user_id integer, p_target_user_id integer) RETURNS TABLE(user_id integer, suspended_at timestamp with time zone, reason_code text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_audit_logs
    WHERE admin_audit_logs.id = p_audit_id
      AND admin_audit_logs.admin_user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_AUDIT_REQUIRED';
  END IF;

  SELECT users.role INTO v_target_role
  FROM users
  WHERE users.id = p_target_user_id
  FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_USER_NOT_FOUND';
  END IF;

  IF p_target_user_id = p_admin_user_id OR v_target_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_USER_UNSUSPENSION_FORBIDDEN';
  END IF;

  UPDATE users
  SET
    suspended_at = NULL,
    suspended_by = NULL,
    suspension_reason_code = NULL,
    updated_at = NOW()
  WHERE users.id = p_target_user_id;

  UPDATE admin_audit_logs
  SET metadata = admin_audit_logs.metadata || jsonb_build_object(
    'outcome', 'succeeded'
  )
  WHERE admin_audit_logs.id = p_audit_id;

  RETURN QUERY SELECT p_target_user_id, NULL::TIMESTAMPTZ, NULL::TEXT;
END;
$$;


--
-- Name: update_provider_subscription_status(text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_provider_subscription_status(p_billing_provider text, p_provider_subscription_id text, p_status text, p_provider_price_id text, p_plan_name text DEFAULT NULL::text, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(user_id integer, plan_id integer, plan_name text, status text, billing_provider text, provider_customer_id text, provider_subscription_id text, provider_price_id text, current_period_end timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_plan_name TEXT := 'FREE';
  target_plan_id INTEGER;
BEGIN
  IF p_status IN ('active', 'trialing', 'past_due') THEN
    SELECT plans.name
    INTO target_plan_name
    FROM plan_provider_mappings
    INNER JOIN provider_mappings ON provider_mappings.id = plan_provider_mappings.provider_mapping_id
    INNER JOIN plans ON plans.id = plan_provider_mappings.plan_id
    WHERE provider_mappings.provider = p_billing_provider
      AND provider_mappings.provider_price_id = p_provider_price_id
    ORDER BY plan_provider_mappings.is_default DESC, plan_provider_mappings.provider_mapping_id
    LIMIT 1;

    target_plan_name := COALESCE(NULLIF(UPPER(TRIM(p_plan_name)), ''), target_plan_name, 'PRO');
  END IF;

  SELECT plans.id
  INTO target_plan_id
  FROM plans
  WHERE plans.name = target_plan_name
  LIMIT 1;

  RETURN QUERY
  UPDATE user_subscriptions
  SET
    plan_id = target_plan_id,
    status = CASE
      WHEN p_status = 'trialing' THEN 'trialing'
      WHEN p_status = 'active' THEN 'active'
      WHEN p_status = 'past_due' THEN 'past_due'
      WHEN p_status IN ('canceled', 'cancelled') THEN 'cancelled'
      ELSE 'expired'
    END,
    provider_price_id = COALESCE(p_provider_price_id, user_subscriptions.provider_price_id),
    current_period_end = COALESCE(p_current_period_end, user_subscriptions.current_period_end)
  WHERE user_subscriptions.billing_provider = p_billing_provider
    AND user_subscriptions.provider_subscription_id = p_provider_subscription_id
  RETURNING
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    (SELECT plans.name FROM plans WHERE plans.id = user_subscriptions.plan_id),
    user_subscriptions.status,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end;
END;
$$;


--
-- Name: update_tour_cart_item(integer, integer, date, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tour_cart_item(p_user_id integer, p_item_id integer, p_scheduled_date date DEFAULT NULL::date, p_participants integer DEFAULT NULL::integer, p_needs_transfer boolean DEFAULT NULL::boolean) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  UPDATE tour_cart_items AS cart_item
  SET
    scheduled_date = COALESCE(p_scheduled_date, cart_item.scheduled_date),
    participants = COALESCE(p_participants, cart_item.participants),
    needs_transfer = COALESCE(p_needs_transfer, cart_item.needs_transfer),
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


--
-- Name: update_usage_event_cost(bigint, integer, integer, numeric, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_usage_event_cost(p_usage_event_id bigint, p_user_id integer, p_tokens integer DEFAULT 0, p_estimated_cost numeric DEFAULT NULL::numeric, p_trace_id text DEFAULT NULL::text, p_model_usage jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(id bigint, user_id integer, feature text, tokens integer, estimated_cost numeric, trace_id text, model_usage jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE usage_events
  SET
    tokens = GREATEST(COALESCE(p_tokens, 0), 0),
    estimated_cost = p_estimated_cost,
    trace_id = COALESCE(p_trace_id, usage_events.trace_id),
    model_usage = COALESCE(p_model_usage, usage_events.model_usage, '[]'::jsonb)
  WHERE usage_events.id = p_usage_event_id
    AND usage_events.user_id = p_user_id
  RETURNING
    usage_events.id,
    usage_events.user_id,
    usage_events.feature,
    usage_events.tokens,
    usage_events.estimated_cost,
    usage_events.trace_id,
    usage_events.model_usage,
    usage_events.created_at;
END;
$$;


--
-- Name: update_user_profile(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_profile(p_user_id integer, p_name text) RETURNS TABLE(id integer, email text, name text, role text, profile_image_key text, password_hash text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET name = NULLIF(BTRIM(p_name), '')
  WHERE users.id = p_user_id
  RETURNING
    users.id,
    users.email,
    users.name,
    users.role,
    users.profile_image_key,
    users.password_hash,
    users.created_at,
    users.updated_at;
END;
$$;


--
-- Name: update_user_profile_image(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_profile_image(p_user_id integer, p_profile_image_key text) RETURNS TABLE(id integer, email text, name text, role text, profile_image_key text, password_hash text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET profile_image_key = NULLIF(BTRIM(p_profile_image_key), '')
  WHERE users.id = p_user_id
  RETURNING
    users.id,
    users.email,
    users.name,
    users.role,
    users.profile_image_key,
    users.password_hash,
    users.created_at,
    users.updated_at;
END;
$$;


--
-- Name: upsert_provider_subscription(integer, text, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_provider_subscription(p_user_id integer, p_plan_name text, p_status text, p_billing_provider text, p_provider_customer_id text, p_provider_subscription_id text, p_provider_price_id text, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(user_id integer, plan_id integer, plan_name text, status text, billing_provider text, provider_customer_id text, provider_subscription_id text, provider_price_id text, current_period_end timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_plan_id INTEGER;
BEGIN
  SELECT plans.id
  INTO target_plan_id
  FROM plans
  WHERE plans.name = p_plan_name
  LIMIT 1;

  IF target_plan_id IS NULL THEN
    RAISE EXCEPTION 'Unknown plan: %', p_plan_name;
  END IF;

  RETURN QUERY
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    billing_provider,
    provider_customer_id,
    provider_subscription_id,
    provider_price_id,
    current_period_end
  )
  VALUES (
    p_user_id,
    target_plan_id,
    COALESCE(p_status, 'active'),
    p_billing_provider,
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_price_id,
    p_current_period_end
  )
  ON CONFLICT ON CONSTRAINT user_subscriptions_pkey DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    billing_provider = COALESCE(EXCLUDED.billing_provider, user_subscriptions.billing_provider),
    provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, user_subscriptions.provider_customer_id),
    provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, user_subscriptions.provider_subscription_id),
    provider_price_id = COALESCE(EXCLUDED.provider_price_id, user_subscriptions.provider_price_id),
    current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end)
  RETURNING
    user_subscriptions.user_id,
    user_subscriptions.plan_id,
    (SELECT plans.name FROM plans WHERE plans.id = user_subscriptions.plan_id),
    user_subscriptions.status,
    user_subscriptions.billing_provider,
    user_subscriptions.provider_customer_id,
    user_subscriptions.provider_subscription_id,
    user_subscriptions.provider_price_id,
    user_subscriptions.current_period_end;
END;
$$;

CREATE FUNCTION public.save_tool_result_reference(
    p_reference_id text,
    p_conversation_code text,
    p_user_id integer,
    p_tool_name text,
    p_result jsonb,
    p_total_count integer,
    p_expires_at timestamp with time zone
) RETURNS TABLE(
    reference_id text,
    tool_name text,
    total_count integer,
    created_at timestamp with time zone,
    expires_at timestamp with time zone
)
    LANGUAGE sql
    AS $$
  WITH expired AS (
    DELETE FROM public.tool_result_references
    WHERE expires_at <= CURRENT_TIMESTAMP
  )
  INSERT INTO public.tool_result_references AS stored (
    reference_id,
    conversation_code,
    user_id,
    tool_name,
    result,
    total_count,
    expires_at
  ) VALUES (
    p_reference_id,
    p_conversation_code,
    p_user_id,
    p_tool_name,
    p_result,
    p_total_count,
    p_expires_at
  )
  RETURNING
    stored.reference_id,
    stored.tool_name,
    stored.total_count,
    stored.created_at,
    stored.expires_at;
$$;

CREATE FUNCTION public.get_tool_result_reference(
    p_reference_id text,
    p_conversation_code text,
    p_user_id integer
) RETURNS TABLE(
    reference_id text,
    tool_name text,
    result jsonb,
    total_count integer,
    created_at timestamp with time zone,
    expires_at timestamp with time zone
)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    stored.reference_id,
    stored.tool_name,
    stored.result,
    stored.total_count,
    stored.created_at,
    stored.expires_at
  FROM public.tool_result_references AS stored
  WHERE stored.reference_id = p_reference_id
    AND stored.conversation_code = p_conversation_code
    AND (
      (stored.user_id IS NULL AND p_user_id IS NULL)
      OR stored.user_id = p_user_id
    )
    AND stored.expires_at > CURRENT_TIMESTAMP;
$$;

-- Query-layer write contracts consolidated from previously inline SQL.

CREATE FUNCTION public.create_user(
    p_email text,
    p_name text,
    p_password_hash text
) RETURNS SETOF public.users
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.users (email, name, password_hash)
  VALUES (p_email, NULLIF(BTRIM(p_name), ''), p_password_hash)
  RETURNING *;
END;
$$;


CREATE FUNCTION public.create_refresh_token(
    p_user_id integer,
    p_token_hash text,
    p_expires_at timestamp with time zone
) RETURNS SETOF public.refresh_tokens
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at)
  RETURNING *;
END;
$$;


CREATE FUNCTION public.revoke_refresh_token(p_token_hash text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_revoked_count integer;
BEGIN
  UPDATE public.refresh_tokens
  SET revoked_at = NOW()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
  RETURN v_revoked_count > 0;
END;
$$;


CREATE FUNCTION public.record_usage_log(
    p_user_id bigint,
    p_prompt_tokens integer,
    p_completion_tokens integer,
    p_estimated_cost numeric
) RETURNS SETOF public.usage_logs
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.usage_logs (
    user_id,
    prompt_tokens,
    completion_tokens,
    estimated_cost
  ) VALUES (
    p_user_id,
    p_prompt_tokens,
    p_completion_tokens,
    p_estimated_cost
  )
  RETURNING *;
END;
$$;


CREATE FUNCTION public.upsert_knowledge_document(
    p_external_id text,
    p_title text,
    p_content text,
    p_source text,
    p_document_type text,
    p_category text,
    p_locale text,
    p_tags text[],
    p_metadata jsonb,
    p_content_hash text,
    p_active boolean
) RETURNS SETOF public.knowledge_documents
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.knowledge_documents AS documents (
    external_id,
    title,
    content,
    source,
    document_type,
    category,
    locale,
    tags,
    metadata,
    content_hash,
    active,
    updated_at
  ) VALUES (
    p_external_id,
    p_title,
    p_content,
    p_source,
    p_document_type,
    p_category,
    p_locale,
    COALESCE(p_tags, '{}'::text[]),
    COALESCE(p_metadata, '{}'::jsonb),
    p_content_hash,
    COALESCE(p_active, true),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (external_id) DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    source = EXCLUDED.source,
    document_type = EXCLUDED.document_type,
    category = EXCLUDED.category,
    locale = EXCLUDED.locale,
    tags = EXCLUDED.tags,
    metadata = EXCLUDED.metadata,
    content_hash = EXCLUDED.content_hash,
    active = EXCLUDED.active,
    updated_at = CURRENT_TIMESTAMP
  RETURNING documents.*;
END;
$$;


CREATE FUNCTION public.replace_knowledge_chunks(
    p_document_id integer,
    p_chunks jsonb
) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF jsonb_typeof(COALESCE(p_chunks, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'knowledge chunks must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.knowledge_chunks
  WHERE document_id = p_document_id;

  INSERT INTO public.knowledge_chunks (
    document_id,
    chunk_index,
    content,
    token_count,
    metadata,
    embedding,
    updated_at
  )
  SELECT
    p_document_id,
    chunk.chunk_index,
    chunk.content,
    chunk.token_count,
    COALESCE(chunk.metadata, '{}'::jsonb),
    chunk.embedding::public.vector,
    CURRENT_TIMESTAMP
  FROM jsonb_to_recordset(COALESCE(p_chunks, '[]'::jsonb)) AS chunk(
    chunk_index integer,
    content text,
    token_count integer,
    metadata jsonb,
    embedding text
  );
END;
$$;


CREATE FUNCTION public.create_tour_reservation_for_conversation(
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
BEGIN
  SELECT id INTO v_conversation_id
  FROM public.ensure_conversation(p_conversation_code, p_user_id);

  IF p_tour_date IS NOT NULL THEN
    RETURN public.create_tour_reservation_for_date(
      p_tour_id,
      p_tour_date,
      p_participants,
      p_customer_name,
      p_customer_email,
      v_conversation_id,
      p_confirmation_code,
      p_discount_rate,
      p_user_id
    );
  END IF;

  SELECT to_jsonb(reservation_result) INTO v_result
  FROM public.create_tour_reservation(
    p_tour_id,
    p_participants,
    p_customer_name,
    p_customer_email,
    v_conversation_id,
    p_confirmation_code,
    p_discount_rate,
    p_user_id
  ) AS reservation_result;

  RETURN v_result;
END;
$$;


CREATE FUNCTION public.upsert_tour_cart_item(
    p_user_id integer,
    p_tour_id integer,
    p_scheduled_date date DEFAULT NULL::date,
    p_participants integer DEFAULT 1,
    p_needs_transfer boolean DEFAULT NULL::boolean,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(
    id integer,
    user_id integer,
    tour_id integer,
    scheduled_date date,
    participants integer,
    needs_transfer boolean,
    metadata jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    tour_name text,
    tour_description text,
    tour_price numeric,
    tour_available_slots integer,
    tour_location text,
    tour_node text,
    tour_subnode text,
    tour_zone text,
    tour_duration_hours integer,
    tour_difficulty text
)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_id integer;
BEGIN
  INSERT INTO public.tour_cart_items AS cart (
    user_id,
    tour_id,
    scheduled_date,
    participants,
    needs_transfer,
    metadata,
    updated_at
  ) VALUES (
    p_user_id,
    p_tour_id,
    p_scheduled_date,
    p_participants,
    p_needs_transfer,
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT ON CONSTRAINT tour_cart_items_user_id_tour_id_key
  DO UPDATE SET
    scheduled_date = COALESCE(EXCLUDED.scheduled_date, cart.scheduled_date),
    participants = EXCLUDED.participants,
    needs_transfer = COALESCE(EXCLUDED.needs_transfer, cart.needs_transfer),
    metadata = cart.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING cart.id INTO v_item_id;

  RETURN QUERY
  SELECT * FROM public.get_tour_cart_item_by_id(p_user_id, v_item_id);
END;
$$;

-- Triggers are installed here because their functions are owned by this script.
--
-- Name: billing_events billing_events_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_events_set_updated_at BEFORE UPDATE ON public.billing_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: node node_propagate_coordinates_to_tours; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER node_propagate_coordinates_to_tours AFTER UPDATE OF lat, lon ON public.node FOR EACH ROW EXECUTE FUNCTION public.propagate_node_coordinates_to_tours();


--
-- Name: plan_provider_mappings plan_provider_mappings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_provider_mappings_set_updated_at BEFORE UPDATE ON public.plan_provider_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plan_provider_mappings plan_provider_mappings_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_provider_mappings_single_default BEFORE INSERT OR UPDATE OF is_default, provider_mapping_id, plan_id ON public.plan_provider_mappings FOR EACH ROW EXECUTE FUNCTION public.assert_single_default_plan_provider_mapping();


--
-- Name: plans plans_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: provider_mappings provider_mappings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER provider_mappings_set_updated_at BEFORE UPDATE ON public.provider_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tour_provider_mappings tour_provider_mappings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tour_provider_mappings_set_updated_at BEFORE UPDATE ON public.tour_provider_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tour_provider_mappings tour_provider_mappings_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tour_provider_mappings_single_default BEFORE INSERT OR UPDATE OF is_default, provider_mapping_id, tour_id ON public.tour_provider_mappings FOR EACH ROW EXECUTE FUNCTION public.assert_single_default_tour_provider_mapping();


--
-- Name: tours tours_derive_coordinates_from_node; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tours_derive_coordinates_from_node BEFORE INSERT OR UPDATE OF node_id, lat, lon ON public.tours FOR EACH ROW EXECUTE FUNCTION public.derive_tour_coordinates_from_node();


--
-- Name: user_subscriptions user_subscriptions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_subscriptions_set_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
