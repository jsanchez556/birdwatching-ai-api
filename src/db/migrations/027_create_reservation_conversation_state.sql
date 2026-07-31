CREATE TABLE IF NOT EXISTS reservation_conversation_states (
  conversation_id BIGINT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  status TEXT NOT NULL DEFAULT 'collecting_information' CHECK (
    status IN ('collecting_information', 'ready_for_confirmation', 'confirmed', 'cancelled')
  ),
  proposed_values JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposed_values) = 'object'),
  confirmed_values JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(confirmed_values) = 'object'),
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
  booking_idempotency_key TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_state_booking_key
ON reservation_conversation_states(booking_idempotency_key)
WHERE booking_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservation_state_audit_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  previous_version INTEGER NOT NULL CHECK (previous_version >= 0),
  new_version INTEGER NOT NULL CHECK (new_version = previous_version + 1),
  event_type TEXT NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  resulting_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmation_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type TEXT NOT NULL,
  source_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (conversation_id, new_version)
);

CREATE INDEX IF NOT EXISTS idx_reservation_state_audit_conversation
ON reservation_state_audit_events(conversation_id, new_version ASC);

CREATE OR REPLACE FUNCTION get_reservation_conversation_state(
  p_conversation_code TEXT,
  p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  conversation_id BIGINT,
  version INTEGER,
  status TEXT,
  proposed_values JSONB,
  confirmed_values JSONB,
  reservation_id INTEGER,
  booking_idempotency_key TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
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

CREATE OR REPLACE FUNCTION mutate_reservation_conversation_state(
  p_conversation_code TEXT,
  p_user_id INTEGER,
  p_expected_version INTEGER,
  p_proposed_values JSONB,
  p_confirmed_values JSONB,
  p_status TEXT,
  p_event_type TEXT,
  p_changed_fields TEXT[],
  p_source_type TEXT,
  p_source_id TEXT DEFAULT NULL
)
RETURNS SETOF reservation_conversation_states
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
      'tourId', 'date', 'participants', 'transportationRequired',
      'customerName', 'customerEmail', 'itineraryStartDate', 'itineraryEndDate'
    ])
    OR (p_confirmed_values->>'tourId')::INTEGER <= 0
    OR (p_confirmed_values->>'participants')::INTEGER <= 0
    OR (p_confirmed_values->>'transportationRequired')::BOOLEAN IS NULL
    OR ((p_confirmed_values->>'transportationRequired')::BOOLEAN = TRUE
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

CREATE OR REPLACE FUNCTION book_reservation_from_state(
  p_conversation_code TEXT,
  p_user_id INTEGER,
  p_expected_version INTEGER,
  p_confirmation_code TEXT,
  p_discount_rate NUMERIC,
  p_idempotency_key TEXT,
  p_source_type TEXT,
  p_source_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  conversation_row conversations%ROWTYPE;
  state_row reservation_conversation_states%ROWTYPE;
  booking_result JSONB;
  existing_result JSONB;
  confirmed JSONB;
  required_fields TEXT[] := ARRAY[
    'tourId', 'date', 'participants', 'transportationRequired',
    'customerName', 'customerEmail', 'itineraryStartDate', 'itineraryEndDate'
  ];
  missing_field TEXT;
BEGIN
  SELECT c.* INTO conversation_row
  FROM conversations AS c
  WHERE c.conversation_code = p_conversation_code
  FOR UPDATE;

  IF NOT FOUND OR (conversation_row.user_id IS NOT NULL
    AND (p_user_id IS NULL OR conversation_row.user_id <> p_user_id)) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT rs.* INTO state_row
  FROM reservation_conversation_states AS rs
  WHERE rs.conversation_id = conversation_row.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation state not found' USING ERRCODE = 'P0002';
  END IF;

  IF state_row.booking_idempotency_key = p_idempotency_key
    AND state_row.reservation_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'success', true,
      'idempotent', true,
      'state_version', state_row.version,
      'id', r.id,
      'user_id', r.user_id,
      'customer_name', r.customer_name,
      'customer_email', r.customer_email,
      'conversation_id', conversation_row.conversation_code,
      'tour_id', r.tour_id,
      'participants', r.participants,
      'confirmation_code', r.confirmation_code,
      'created_at', r.created_at,
      'total_price', r.total_price,
      'tour_name', t.name,
      'tour_price', t.price,
      'tour_available_slots', t.available_slots,
      'tour_location', COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name),
      'tour_duration_hours', t.duration_hours,
      'tour_difficulty', t.difficulty
    ) INTO existing_result
    FROM reservations AS r
    INNER JOIN tours AS t ON t.id = r.tour_id
    INNER JOIN node AS tour_node ON tour_node.id = t.node_id
    INNER JOIN zone AS z ON z.id = tour_node.zone_id
    LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
    WHERE r.id = state_row.reservation_id;
    RETURN existing_result;
  END IF;

  IF state_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'reservation state version conflict' USING ERRCODE = '40001';
  END IF;

  IF state_row.status <> 'ready_for_confirmation'
    OR state_row.proposed_values <> '{}'::jsonb THEN
    RAISE EXCEPTION 'reservation state is not ready for booking' USING ERRCODE = '22023';
  END IF;

  confirmed := state_row.confirmed_values;
  FOREACH missing_field IN ARRAY required_fields LOOP
    IF NOT confirmed ? missing_field OR confirmed->missing_field = 'null'::jsonb THEN
      RAISE EXCEPTION 'reservation state is missing required confirmed values'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF (confirmed->>'transportationRequired')::BOOLEAN = TRUE
    AND (NOT confirmed ? 'pickupLocation' OR confirmed->'pickupLocation' = 'null'::jsonb) THEN
    RAISE EXCEPTION 'reservation state is missing required confirmed values'
      USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(result_row) INTO booking_result
  FROM create_tour_reservation(
    (confirmed->>'tourId')::INTEGER,
    (confirmed->>'participants')::INTEGER,
    confirmed->>'customerName',
    confirmed->>'customerEmail',
    conversation_row.id,
    p_confirmation_code,
    COALESCE(p_discount_rate, 0),
    p_user_id
  ) AS result_row;

  IF COALESCE((booking_result->>'success')::BOOLEAN, FALSE) = FALSE THEN
    RETURN booking_result || jsonb_build_object('state_version', state_row.version);
  END IF;

  UPDATE reservation_conversation_states AS rs
  SET
    version = state_row.version + 1,
    status = 'confirmed',
    reservation_id = (booking_result->>'id')::INTEGER,
    booking_idempotency_key = p_idempotency_key,
    updated_at = CURRENT_TIMESTAMP
  WHERE rs.conversation_id = state_row.conversation_id;

  INSERT INTO reservation_state_audit_events (
    conversation_id, previous_version, new_version, event_type, changed_fields,
    previous_values, resulting_values, confirmation_state, source_type, source_id
  ) VALUES (
    state_row.conversation_id,
    state_row.version,
    state_row.version + 1,
    'booking_succeeded',
    ARRAY['status', 'reservationId'],
    jsonb_build_object('status', state_row.status, 'reservationId', state_row.reservation_id),
    jsonb_build_object('status', 'confirmed', 'reservationId', (booking_result->>'id')::INTEGER),
    jsonb_build_object('status', 'confirmed', 'hasProposedValues', false),
    p_source_type,
    p_source_id
  );

  RETURN booking_result || jsonb_build_object(
    'state_version', state_row.version + 1,
    'idempotent', false
  );
END;
$$;
