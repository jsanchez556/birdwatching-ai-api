-- Canonicalize the customer-facing transfer domain in deployed databases.
-- References to the retired terminology below are migration inputs only.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.transfers') IS NULL
    AND to_regclass('public.transportations') IS NOT NULL THEN
    ALTER TABLE public.transportations RENAME TO transfers;
  END IF;

  IF to_regclass('public.transfers_id_seq') IS NULL
    AND to_regclass('public.transportations_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.transportations_id_seq RENAME TO transfers_id_seq;
  END IF;

  IF to_regclass('public.transfer_by_node') IS NULL
    AND to_regclass('public.transportation_by_node') IS NOT NULL THEN
    ALTER TABLE public.transportation_by_node RENAME TO transfer_by_node;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transfer_by_node'
      AND column_name = 'transportation_id'
  ) THEN
    ALTER TABLE public.transfer_by_node RENAME COLUMN transportation_id TO transfer_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tour_cart_items'
      AND column_name = 'needs_transportation'
  ) THEN
    ALTER TABLE public.tour_cart_items RENAME COLUMN needs_transportation TO needs_transfer;
  END IF;
END;
$$;

DO $$
DECLARE
  rename_pair text[];
BEGIN
  FOREACH rename_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['transfers', 'transportations_pkey', 'transfers_pkey'],
    ARRAY['transfers', 'transportations_charge_type_check', 'transfers_charge_type_check'],
    ARRAY['transfers', 'chk_transportations_lat_range', 'chk_transfers_lat_range'],
    ARRAY['transfers', 'chk_transportations_lon_range', 'chk_transfers_lon_range'],
    ARRAY['transfer_by_node', 'transportation_by_node_pkey', 'transfer_by_node_pkey'],
    ARRAY['transfer_by_node', 'transportation_by_node_node_id_fkey', 'transfer_by_node_node_id_fkey'],
    ARRAY['transfer_by_node', 'transportation_by_node_transportation_id_fkey', 'transfer_by_node_transfer_id_fkey'],
    ARRAY['transfer_by_node', 'transportation_by_node_tmp_node_id_not_null', 'transfer_by_node_tmp_node_id_not_null'],
    ARRAY['transfer_by_node', 'transportation_by_node_tmp_transportation_id_not_null', 'transfer_by_node_tmp_transfer_id_not_null'],
    ARRAY['transfer_by_node', 'transportation_by_node_tmp_price_not_null', 'transfer_by_node_tmp_price_not_null'],
    ARRAY['transfer_by_node', 'transportation_by_node_tmp_min_rate_not_null', 'transfer_by_node_tmp_min_rate_not_null'],
    ARRAY['transfer_by_node', 'transportation_by_node_tmp_is_active_not_null', 'transfer_by_node_tmp_is_active_not_null'],
    ARRAY['transfer_by_node', 'transportation_by_node_min_rate_check', 'transfer_by_node_min_rate_check'],
    ARRAY['transfer_by_node', 'transportation_by_node_price_check', 'transfer_by_node_price_check']
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_constraint constraint_record
      JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
      JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
      WHERE schema_record.nspname = 'public'
        AND table_record.relname = rename_pair[1]
        AND constraint_record.conname = rename_pair[2]
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_record
      JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
      JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
      WHERE schema_record.nspname = 'public'
        AND table_record.relname = rename_pair[1]
        AND constraint_record.conname = rename_pair[3]
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        rename_pair[1], rename_pair[2], rename_pair[3]
      );
    END IF;
  END LOOP;
END;
$$;

-- These functions expose the renamed cart column in their SQL contracts.
DROP FUNCTION IF EXISTS public.update_tour_cart_item(integer, integer, date, integer, boolean);
DROP FUNCTION IF EXISTS public.upsert_tour_cart_item(integer, integer, date, integer, boolean, jsonb);
DROP FUNCTION IF EXISTS public.get_tour_cart_item_by_id(integer, integer);
DROP FUNCTION IF EXISTS public.get_tour_cart_items(integer);

CREATE FUNCTION public.get_tour_cart_items(p_user_id integer) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE sql
    AS $$
  SELECT
    i.id, i.user_id, i.tour_id, i.scheduled_date, i.participants,
    i.needs_transfer, i.metadata, i.created_at, i.updated_at,
    t.name AS tour_name, t.description AS tour_description,
    t.price AS tour_price, t.available_slots AS tour_available_slots,
    COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS tour_location,
    COALESCE(parent_node.name, tour_node.name) AS tour_node,
    CASE WHEN parent_node.id IS NULL THEN NULL ELSE tour_node.name END AS tour_subnode,
    z.name AS tour_zone, t.duration_hours AS tour_duration_hours,
    t.difficulty AS tour_difficulty
  FROM tour_cart_items AS i
  INNER JOIN tours AS t ON t.id = i.tour_id
  INNER JOIN node AS tour_node ON tour_node.id = t.node_id
  INNER JOIN zone AS z ON z.id = tour_node.zone_id
  LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
  WHERE i.user_id = p_user_id
  ORDER BY i.scheduled_date NULLS LAST, i.created_at ASC;
$$;

CREATE FUNCTION public.get_tour_cart_item_by_id(p_user_id integer, p_item_id integer) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE sql
    AS $$
  SELECT * FROM get_tour_cart_items(p_user_id) AS item WHERE item.id = p_item_id;
$$;

CREATE FUNCTION public.update_tour_cart_item(p_user_id integer, p_item_id integer, p_scheduled_date date DEFAULT NULL::date, p_participants integer DEFAULT NULL::integer, p_needs_transfer boolean DEFAULT NULL::boolean) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  UPDATE tour_cart_items AS cart_item
  SET scheduled_date = COALESCE(p_scheduled_date, cart_item.scheduled_date),
      participants = COALESCE(p_participants, cart_item.participants),
      needs_transfer = COALESCE(p_needs_transfer, cart_item.needs_transfer),
      updated_at = NOW()
  WHERE cart_item.user_id = p_user_id AND cart_item.id = p_item_id
  RETURNING cart_item.id INTO v_item_id;
  IF v_item_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM get_tour_cart_item_by_id(p_user_id, v_item_id);
END;
$$;

CREATE FUNCTION public.upsert_tour_cart_item(p_user_id integer, p_tour_id integer, p_scheduled_date date DEFAULT NULL::date, p_participants integer DEFAULT 1, p_needs_transfer boolean DEFAULT NULL::boolean, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id integer, user_id integer, tour_id integer, scheduled_date date, participants integer, needs_transfer boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tour_name text, tour_description text, tour_price numeric, tour_available_slots integer, tour_location text, tour_node text, tour_subnode text, tour_zone text, tour_duration_hours integer, tour_difficulty text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_id integer;
BEGIN
  INSERT INTO public.tour_cart_items AS cart (
    user_id, tour_id, scheduled_date, participants, needs_transfer, metadata, updated_at
  ) VALUES (
    p_user_id, p_tour_id, p_scheduled_date, p_participants, p_needs_transfer,
    COALESCE(p_metadata, '{}'::jsonb), NOW()
  )
  ON CONFLICT ON CONSTRAINT tour_cart_items_user_id_tour_id_key
  DO UPDATE SET
    scheduled_date = COALESCE(EXCLUDED.scheduled_date, cart.scheduled_date),
    participants = EXCLUDED.participants,
    needs_transfer = COALESCE(EXCLUDED.needs_transfer, cart.needs_transfer),
    metadata = cart.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING cart.id INTO v_item_id;
  RETURN QUERY SELECT * FROM public.get_tour_cart_item_by_id(p_user_id, v_item_id);
END;
$$;

-- Rewrite active structured state without changing user-authored message history.
CREATE OR REPLACE FUNCTION pg_temp.rename_transfer_document(document jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(
    replace(
      replace(document::text, 'transportation', 'transfer'),
      'Transportation', 'Transfer'
    ),
    'TRANSPORTATION', 'TRANSFER'
  )::jsonb;
$$;

UPDATE public.conversations
SET metadata = pg_temp.rename_transfer_document(metadata)
WHERE metadata::text ILIKE '%transportation%';

UPDATE public.conversation_summaries
SET summary = pg_temp.rename_transfer_document(summary)
WHERE summary::text ILIKE '%transportation%';

UPDATE public.tour_cart_items
SET metadata = pg_temp.rename_transfer_document(metadata)
WHERE metadata::text ILIKE '%transportation%';

UPDATE public.reservation_conversation_states
SET proposed_values = pg_temp.rename_transfer_document(proposed_values),
    confirmed_values = pg_temp.rename_transfer_document(confirmed_values)
WHERE proposed_values::text ILIKE '%transportation%'
   OR confirmed_values::text ILIKE '%transportation%';

UPDATE public.reservation_state_audit_events
SET previous_values = pg_temp.rename_transfer_document(previous_values),
    resulting_values = pg_temp.rename_transfer_document(resulting_values),
    confirmation_state = pg_temp.rename_transfer_document(confirmation_state)
WHERE previous_values::text ILIKE '%transportation%'
   OR resulting_values::text ILIKE '%transportation%'
   OR confirmation_state::text ILIKE '%transportation%';

-- Older deployed schemas may predate oversized tool-result persistence.
DO $$
BEGIN
  IF to_regclass('public.tool_result_references') IS NOT NULL THEN
    EXECUTE $statement$
      UPDATE public.tool_result_references
      SET result = pg_temp.rename_transfer_document(result)
      WHERE result::text ILIKE '%transportation%'
    $statement$;
  END IF;
END;
$$;

-- Refresh unchanged-signature functions whose bodies inspect structured keys.
DO $$
DECLARE
  function_identity regprocedure;
  function_definition text;
BEGIN
  FOREACH function_identity IN ARRAY ARRAY[
    to_regprocedure('public.book_reservation_from_state(text,integer,integer,text,numeric,text,text,text)'),
    to_regprocedure('public.mutate_reservation_conversation_state(text,integer,integer,jsonb,jsonb,text,text,text[],text,text)')
  ]
  LOOP
    IF function_identity IS NOT NULL THEN
      function_definition := pg_get_functiondef(function_identity);
      IF function_definition ILIKE '%transportation%' THEN
        EXECUTE replace(
          replace(
            replace(function_definition, 'transportation', 'transfer'),
            'Transportation', 'Transfer'
          ),
          'TRANSPORTATION', 'TRANSFER'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
