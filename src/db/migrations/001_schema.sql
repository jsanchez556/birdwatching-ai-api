-- Consolidated Birdwatching AI PostgreSQL schema.
-- Generated from the live schema and verified repository call sites.

BEGIN;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: user_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_memories (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    content_fingerprint text NOT NULL,
    confidence numeric(4,3) NOT NULL,
    source_message_id bigint,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp with time zone,
    is_user_editable boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    superseded_by_id bigint,
    conflict_key text,
    resolution text DEFAULT 'none'::text NOT NULL,
    superseded_at timestamp with time zone,
    CONSTRAINT user_memories_category_check CHECK ((category = ANY (ARRAY['preferences'::text, 'accessibility_requirements'::text, 'recurring_travel_constraints'::text, 'bird_interests'::text, 'preferred_language'::text, 'budget_ranges'::text]))),
    CONSTRAINT user_memories_check CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
    CONSTRAINT user_memories_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT user_memories_conflict_key_length CHECK (((conflict_key IS NULL) OR (((length(btrim(conflict_key)) >= 1) AND (length(btrim(conflict_key)) <= 100)) AND (conflict_key ~ '^[a-z0-9_]+$'::text)))),
    CONSTRAINT user_memories_content_check CHECK (((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 500))),
    CONSTRAINT user_memories_content_fingerprint_check CHECK ((content_fingerprint ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT user_memories_resolution_check CHECK ((resolution = ANY (ARRAY['none'::text, 'explicit_recent_correction'::text])))
);

--
-- Name: reservation_conversation_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_conversation_states (
    conversation_id bigint NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'collecting_information'::text NOT NULL,
    proposed_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    confirmed_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    reservation_id integer,
    booking_idempotency_key text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT reservation_conversation_states_confirmed_values_check CHECK ((jsonb_typeof(confirmed_values) = 'object'::text)),
    CONSTRAINT reservation_conversation_states_proposed_values_check CHECK ((jsonb_typeof(proposed_values) = 'object'::text)),
    CONSTRAINT reservation_conversation_states_status_check CHECK ((status = ANY (ARRAY['collecting_information'::text, 'ready_for_confirmation'::text, 'confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT reservation_conversation_states_version_check CHECK ((version >= 0))
);

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id bigint NOT NULL,
    admin_user_id integer NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_audit_logs_id_seq OWNED BY public.admin_audit_logs.id;


--
-- Name: ai_feature_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_feature_controls (
    feature text NOT NULL,
    disabled_until timestamp with time zone NOT NULL,
    updated_by integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_events (
    id bigint NOT NULL,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    event_name text NOT NULL,
    provider_object_id text,
    provider_customer_id text,
    provider_subscription_id text,
    provider_invoice_id text,
    status text,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_events_event_name_check CHECK ((event_name = ANY (ARRAY['checkout_completed'::text, 'subscription_created'::text, 'subscription_updated'::text, 'subscription_cancelled'::text, 'subscription_renewed'::text, 'payment_failed'::text]))),
    CONSTRAINT billing_events_provider_check CHECK ((provider = ANY (ARRAY['Stripe'::text, 'TiloPay'::text, 'BAC'::text, 'Other'::text])))
);


--
-- Name: billing_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_events_id_seq OWNED BY public.billing_events.id;


--
-- Name: bird_identifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bird_identifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    image_url text NOT NULL,
    prediction text,
    confidence numeric(5,4),
    result jsonb,
    result_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: bird_identifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bird_identifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bird_identifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bird_identifications_id_seq OWNED BY public.bird_identifications.id;


--
-- Name: birds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birds (
    id integer NOT NULL,
    species_code text,
    name text NOT NULL,
    tags text[],
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: birds_by_node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birds_by_node (
    node_id integer NOT NULL,
    bird_id integer NOT NULL,
    rank integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: birds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.birds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: birds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.birds_id_seq OWNED BY public.birds.id;


--
-- Name: conversation_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_summaries (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    version integer NOT NULL,
    schema_version text NOT NULL,
    summary jsonb NOT NULL,
    compacted_message_ids bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL,
    source_token_count integer DEFAULT 0 NOT NULL,
    previous_summary_version integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT conversation_summaries_previous_summary_version_check CHECK (((previous_summary_version IS NULL) OR (previous_summary_version > 0))),
    CONSTRAINT conversation_summaries_source_token_count_check CHECK ((source_token_count >= 0)),
    CONSTRAINT conversation_summaries_version_check CHECK ((version > 0))
);


--
-- Name: conversation_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_summaries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_summaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_summaries_id_seq OWNED BY public.conversation_summaries.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id bigint NOT NULL,
    conversation_code text NOT NULL,
    title text,
    last_message_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country (
    id integer NOT NULL,
    name text NOT NULL,
    acr character varying(8) NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    zoom smallint,
    CONSTRAINT country_viewport_latitude_check CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT country_viewport_longitude_check CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
    CONSTRAINT country_viewport_zoom_check CHECK (((zoom IS NULL) OR ((zoom >= 0) AND (zoom <= 19))))
);


--
-- Name: country_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_id_seq OWNED BY public.country.id;


--
-- Name: experiment_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiment_assignments (
    user_id integer NOT NULL,
    experiment_key text NOT NULL,
    variant text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT experiment_assignments_key_not_blank CHECK ((btrim(experiment_key) <> ''::text)),
    CONSTRAINT experiment_assignments_variant_not_blank CHECK ((btrim(variant) <> ''::text))
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    job_id text NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    user_id integer,
    request_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    result_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'active'::text, 'completed'::text, 'failed'::text, 'not_found'::text])))
);


--
-- Name: knowledge_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_chunks (
    id integer NOT NULL,
    document_id integer NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    token_count integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding public.vector(1536) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_chunks_id_seq OWNED BY public.knowledge_chunks.id;


--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_documents (
    id integer NOT NULL,
    external_id text NOT NULL,
    title text NOT NULL,
    source text,
    document_type text,
    category text,
    locale text,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    content_hash text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    content text
);


--
-- Name: knowledge_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_documents_id_seq OWNED BY public.knowledge_documents.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    user_input text NOT NULL,
    ai_output text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node (
    id integer NOT NULL,
    parent_id integer,
    zone_id integer NOT NULL,
    name text NOT NULL,
    rank integer NOT NULL,
    lat numeric(9,6),
    lon numeric(9,6),
    des text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: node_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_id_seq OWNED BY public.node.id;


--
-- Name: plan_provider_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_provider_mappings (
    plan_id integer NOT NULL,
    provider_mapping_id integer NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    name text NOT NULL,
    max_chats integer NOT NULL,
    max_identifications integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plans_max_chats_check CHECK ((max_chats >= 0)),
    CONSTRAINT plans_max_identifications_check CHECK ((max_identifications >= 0))
);


--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: provider_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_mappings (
    id integer NOT NULL,
    provider text NOT NULL,
    provider_product_id text,
    provider_price_id text,
    provider_sku text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_mappings_provider_check CHECK ((provider = ANY (ARRAY['Stripe'::text, 'TiloPay'::text, 'BAC'::text, 'Other'::text])))
);


--
-- Name: provider_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.provider_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.provider_mappings_id_seq OWNED BY public.provider_mappings.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: reservation_state_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_state_audit_events (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    previous_version integer NOT NULL,
    new_version integer NOT NULL,
    event_type text NOT NULL,
    changed_fields text[] DEFAULT ARRAY[]::text[] NOT NULL,
    previous_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    resulting_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    confirmation_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_type text NOT NULL,
    source_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT reservation_state_audit_events_check CHECK ((new_version = (previous_version + 1))),
    CONSTRAINT reservation_state_audit_events_previous_version_check CHECK ((previous_version >= 0))
);


--
-- Name: reservation_state_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservation_state_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reservation_state_audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservation_state_audit_events_id_seq OWNED BY public.reservation_state_audit_events.id;


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id integer NOT NULL,
    user_id integer,
    customer_name text NOT NULL,
    customer_email text,
    conversation_id bigint NOT NULL,
    tour_id integer NOT NULL,
    participants integer NOT NULL,
    confirmation_code text NOT NULL,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tour_date date,
    occurrence_id bigint,
    CONSTRAINT reservations_participants_check CHECK ((participants > 0)),
    CONSTRAINT reservations_total_price_check CHECK ((total_price >= (0)::numeric))
);


--
-- Name: reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservations_id_seq OWNED BY public.reservations.id;


--
-- Name: schedule_by_tour; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_by_tour (
    tour_id bigint NOT NULL,
    schedule_id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id integer NOT NULL,
    name text NOT NULL,
    "time" time without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: tour_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_cart_items (
    id integer NOT NULL,
    user_id integer NOT NULL,
    tour_id integer NOT NULL,
    scheduled_date date,
    participants integer DEFAULT 1 NOT NULL,
    needs_transportation boolean,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tour_cart_items_participants_check CHECK ((participants > 0))
);


--
-- Name: tour_cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tour_cart_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tour_cart_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tour_cart_items_id_seq OWNED BY public.tour_cart_items.id;


--
-- Name: tour_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_occurrences (
    id integer NOT NULL,
    tour_id integer NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    capacity integer NOT NULL,
    remaining_spaces integer NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT tour_occurrences_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT tour_occurrences_check CHECK (((remaining_spaces >= 0) AND (remaining_spaces <= capacity))),
    CONSTRAINT tour_occurrences_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: tour_occurrences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tour_occurrences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tour_occurrences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tour_occurrences_id_seq OWNED BY public.tour_occurrences.id;


--
-- Name: tour_provider_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_provider_mappings (
    tour_id integer NOT NULL,
    provider_mapping_id integer NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tours (
    id integer NOT NULL,
    node_id integer NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    available_slots integer NOT NULL,
    duration_hours integer NOT NULL,
    duration_value integer NOT NULL,
    duration_unit text DEFAULT 'hours'::text NOT NULL,
    difficulty text NOT NULL,
    lat numeric(9,6),
    lon numeric(9,6),
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    source_url text,
    tour_type text DEFAULT 'unscheduled'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    max_participants integer NOT NULL,
    minimum_price numeric(10,2) NOT NULL,
    type text DEFAULT 'Birdwatching'::text NOT NULL,
    created_by_user_id integer,
    image_path text,
    CONSTRAINT chk_tours_lat_range CHECK (((lat IS NULL) OR ((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric)))),
    CONSTRAINT chk_tours_lon_range CHECK (((lon IS NULL) OR ((lon >= ('-180'::integer)::numeric) AND (lon <= (180)::numeric)))),
    CONSTRAINT tours_available_slots_check CHECK ((available_slots >= 0)),
    CONSTRAINT tours_duration_hours_check CHECK ((duration_hours > 0)),
    CONSTRAINT tours_duration_value_check CHECK ((duration_value > 0)),
    CONSTRAINT tours_duration_unit_check CHECK ((duration_unit = ANY (ARRAY['hours'::text, 'days'::text]))),
    CONSTRAINT tours_max_participants_check CHECK ((max_participants > 0)),
    CONSTRAINT tours_minimum_price_check CHECK ((minimum_price >= (0)::numeric)),
    CONSTRAINT tours_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT tours_tour_type_check CHECK ((tour_type = ANY (ARRAY['scheduled'::text, 'unscheduled'::text]))),
    CONSTRAINT tours_schedule_fields_check CHECK (((tour_type = 'unscheduled'::text AND available_slots = 0
      AND start_date IS NULL AND end_date IS NULL) OR (tour_type = 'scheduled'::text
      AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date))),
    CONSTRAINT tours_image_path_check CHECK ((image_path IS NULL) OR (image_path ~ '^tours/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'::text))
);


--
-- Name: COLUMN tours.lat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.lat IS 'Derived from node.lat; retained for backward-compatible reads.';


--
-- Name: COLUMN tours.lon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.lon IS 'Derived from node.lon; retained for backward-compatible reads.';


--
-- Name: COLUMN tours.created_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.created_by_user_id IS 'Authenticated creator. NULL identifies backward-compatible legacy/system inventory.';


--
-- Name: tours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tours_id_seq OWNED BY public.tours.id;


--
-- Name: transportation_by_node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportation_by_node (
    node_id bigint CONSTRAINT transportation_by_node_tmp_node_id_not_null NOT NULL,
    transportation_id integer CONSTRAINT transportation_by_node_tmp_transportation_id_not_null NOT NULL,
    price numeric(10,2) CONSTRAINT transportation_by_node_tmp_price_not_null NOT NULL,
    min_rate numeric(10,2) CONSTRAINT transportation_by_node_tmp_min_rate_not_null NOT NULL,
    is_active boolean DEFAULT true CONSTRAINT transportation_by_node_tmp_is_active_not_null NOT NULL,
    CONSTRAINT transportation_by_node_min_rate_check CHECK ((min_rate >= (0)::numeric)),
    CONSTRAINT transportation_by_node_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: transportations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportations (
    id integer NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    charge_type text NOT NULL,
    lat numeric(9,6),
    lon numeric(9,6),
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_transportations_lat_range CHECK (((lat IS NULL) OR ((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric)))),
    CONSTRAINT chk_transportations_lon_range CHECK (((lon IS NULL) OR ((lon >= ('-180'::integer)::numeric) AND (lon <= (180)::numeric)))),
    CONSTRAINT transportations_charge_type_check CHECK ((charge_type = ANY (ARRAY['pp'::text, 'pv'::text])))
);


--
-- Name: transportations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transportations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transportations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transportations_id_seq OWNED BY public.transportations.id;


--
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    feature text NOT NULL,
    tokens integer DEFAULT 0 NOT NULL,
    estimated_cost numeric(12,6),
    trace_id text,
    model_usage jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_events_feature_check CHECK ((feature = ANY (ARRAY['chat'::text, 'identification'::text, 'embedding'::text, 'voice'::text, 'image_analysis'::text]))),
    CONSTRAINT usage_events_tokens_check CHECK ((tokens >= 0))
);


--
-- Name: usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_events_id_seq OWNED BY public.usage_events.id;


--
-- Name: usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_logs (
    user_id bigint NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost numeric(12,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    feature text DEFAULT 'openai_tokens'::text NOT NULL,
    tokens integer DEFAULT 0 NOT NULL,
    reference_id text,
    CONSTRAINT usage_logs_completion_tokens_check CHECK ((completion_tokens >= 0)),
    CONSTRAINT usage_logs_prompt_tokens_check CHECK ((prompt_tokens >= 0)),
    CONSTRAINT usage_logs_tokens_check CHECK ((tokens >= 0))
);


--
-- Name: usage_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_logs_id_seq OWNED BY public.usage_logs.id;


--
-- Name: user_memories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_memories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_memories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_memories_id_seq OWNED BY public.user_memories.id;


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    user_id integer NOT NULL,
    plan_id integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    billing_provider text,
    provider_customer_id text,
    provider_subscription_id text,
    provider_price_id text,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    name text,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'customer'::text NOT NULL,
    profile_image_key text,
    suspended_at timestamp with time zone,
    suspended_by integer,
    suspension_reason_code text,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'customer'::text, 'tour guide'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: zone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zone (
    id integer NOT NULL,
    country_id integer NOT NULL,
    name text NOT NULL,
    des text NOT NULL,
    rank integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: zone_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zone_id_seq OWNED BY public.zone.id;


--
-- Name: admin_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_logs_id_seq'::regclass);


--
-- Name: billing_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events ALTER COLUMN id SET DEFAULT nextval('public.billing_events_id_seq'::regclass);


--
-- Name: bird_identifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bird_identifications ALTER COLUMN id SET DEFAULT nextval('public.bird_identifications_id_seq'::regclass);


--
-- Name: birds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds ALTER COLUMN id SET DEFAULT nextval('public.birds_id_seq'::regclass);


--
-- Name: conversation_summaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries ALTER COLUMN id SET DEFAULT nextval('public.conversation_summaries_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: country id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country ALTER COLUMN id SET DEFAULT nextval('public.country_id_seq'::regclass);


--
-- Name: knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.knowledge_chunks_id_seq'::regclass);


--
-- Name: knowledge_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents ALTER COLUMN id SET DEFAULT nextval('public.knowledge_documents_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: node id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node ALTER COLUMN id SET DEFAULT nextval('public.node_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: provider_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_mappings ALTER COLUMN id SET DEFAULT nextval('public.provider_mappings_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: reservation_state_audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_state_audit_events ALTER COLUMN id SET DEFAULT nextval('public.reservation_state_audit_events_id_seq'::regclass);


--
-- Name: reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations ALTER COLUMN id SET DEFAULT nextval('public.reservations_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: tour_cart_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_cart_items ALTER COLUMN id SET DEFAULT nextval('public.tour_cart_items_id_seq'::regclass);


--
-- Name: tour_occurrences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_occurrences ALTER COLUMN id SET DEFAULT nextval('public.tour_occurrences_id_seq'::regclass);


--
-- Name: tours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours ALTER COLUMN id SET DEFAULT nextval('public.tours_id_seq'::regclass);


--
-- Name: transportations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportations ALTER COLUMN id SET DEFAULT nextval('public.transportations_id_seq'::regclass);


--
-- Name: usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events ALTER COLUMN id SET DEFAULT nextval('public.usage_events_id_seq'::regclass);


--
-- Name: usage_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs ALTER COLUMN id SET DEFAULT nextval('public.usage_logs_id_seq'::regclass);


--
-- Name: user_memories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories ALTER COLUMN id SET DEFAULT nextval('public.user_memories_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: zone id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zone ALTER COLUMN id SET DEFAULT nextval('public.zone_id_seq'::regclass);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_feature_controls ai_feature_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feature_controls
    ADD CONSTRAINT ai_feature_controls_pkey PRIMARY KEY (feature);


--
-- Name: billing_events billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_provider_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_provider_provider_event_id_key UNIQUE (provider, provider_event_id);


--
-- Name: bird_identifications bird_identifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bird_identifications
    ADD CONSTRAINT bird_identifications_pkey PRIMARY KEY (id);


--
-- Name: birds_by_node birds_by_node_node_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds_by_node
    ADD CONSTRAINT birds_by_node_node_id_rank_key UNIQUE (node_id, rank);


--
-- Name: birds_by_node birds_by_node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds_by_node
    ADD CONSTRAINT birds_by_node_pkey PRIMARY KEY (node_id, bird_id);


--
-- Name: birds birds_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds
    ADD CONSTRAINT birds_name_key UNIQUE (name);


--
-- Name: birds birds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds
    ADD CONSTRAINT birds_pkey PRIMARY KEY (id);


--
-- Name: birds birds_species_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds
    ADD CONSTRAINT birds_species_code_key UNIQUE (species_code);


--
-- Name: conversation_summaries conversation_summaries_conversation_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_conversation_id_version_key UNIQUE (conversation_id, version);


--
-- Name: conversation_summaries conversation_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_conversation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_conversation_code_key UNIQUE (conversation_code);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: country country_acr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_acr_key UNIQUE (acr);


--
-- Name: country country_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_pkey PRIMARY KEY (id);


--
-- Name: experiment_assignments experiment_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_pkey PRIMARY KEY (user_id, experiment_key);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (job_id);


--
-- Name: knowledge_chunks knowledge_chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_document_id_chunk_index_key UNIQUE (document_id, chunk_index);


--
-- Name: knowledge_chunks knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_external_id_key UNIQUE (external_id);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: node node_parent_id_zone_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node
    ADD CONSTRAINT node_parent_id_zone_id_name_key UNIQUE (parent_id, zone_id, name);


--
-- Name: node node_parent_id_zone_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node
    ADD CONSTRAINT node_parent_id_zone_id_rank_key UNIQUE (parent_id, zone_id, rank);


--
-- Name: node node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node
    ADD CONSTRAINT node_pkey PRIMARY KEY (id);


--
-- Name: plan_provider_mappings plan_provider_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_provider_mappings
    ADD CONSTRAINT plan_provider_mappings_pkey PRIMARY KEY (plan_id, provider_mapping_id);


--
-- Name: plans plans_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_name_key UNIQUE (name);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: provider_mappings provider_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_mappings
    ADD CONSTRAINT provider_mappings_pkey PRIMARY KEY (id);


--
-- Name: provider_mappings provider_mappings_provider_provider_product_id_provider_pri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_mappings
    ADD CONSTRAINT provider_mappings_provider_provider_product_id_provider_pri_key UNIQUE (provider, provider_product_id, provider_price_id, provider_sku);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: reservation_conversation_states reservation_conversation_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_conversation_states
    ADD CONSTRAINT reservation_conversation_states_pkey PRIMARY KEY (conversation_id);


--
-- Name: reservation_state_audit_events reservation_state_audit_events_conversation_id_new_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_state_audit_events
    ADD CONSTRAINT reservation_state_audit_events_conversation_id_new_version_key UNIQUE (conversation_id, new_version);


--
-- Name: reservation_state_audit_events reservation_state_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_state_audit_events
    ADD CONSTRAINT reservation_state_audit_events_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_confirmation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_confirmation_code_key UNIQUE (confirmation_code);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: schedule_by_tour schedule_by_tour_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_by_tour
    ADD CONSTRAINT schedule_by_tour_pkey PRIMARY KEY (tour_id, schedule_id);


--
-- Name: schedules schedules_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_name_key UNIQUE (name);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: tour_cart_items tour_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_cart_items
    ADD CONSTRAINT tour_cart_items_pkey PRIMARY KEY (id);


--
-- Name: tour_cart_items tour_cart_items_user_id_tour_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_cart_items
    ADD CONSTRAINT tour_cart_items_user_id_tour_id_key UNIQUE (user_id, tour_id);


--
-- Name: tour_occurrences tour_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_occurrences
    ADD CONSTRAINT tour_occurrences_pkey PRIMARY KEY (id);


--
-- Name: tour_occurrences tour_occurrences_tour_id_starts_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_occurrences
    ADD CONSTRAINT tour_occurrences_tour_id_starts_at_key UNIQUE (tour_id, starts_at);


--
-- Name: tour_provider_mappings tour_provider_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_provider_mappings
    ADD CONSTRAINT tour_provider_mappings_pkey PRIMARY KEY (tour_id, provider_mapping_id);


--
-- Name: tours tours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_pkey PRIMARY KEY (id);


--
-- Name: transportation_by_node transportation_by_node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_by_node
    ADD CONSTRAINT transportation_by_node_pkey PRIMARY KEY (node_id, transportation_id);


--
-- Name: transportations transportations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportations
    ADD CONSTRAINT transportations_pkey PRIMARY KEY (id);


--
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- Name: user_memories user_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: zone zone_country_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zone
    ADD CONSTRAINT zone_country_id_name_key UNIQUE (country_id, name);


--
-- Name: zone zone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zone
    ADD CONSTRAINT zone_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_audit_logs_admin_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_admin_created_at ON public.admin_audit_logs USING btree (admin_user_id, created_at DESC);


--
-- Name: idx_admin_audit_logs_target_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_target_created_at ON public.admin_audit_logs USING btree (target_type, target_id, created_at DESC);


--
-- Name: idx_billing_events_name_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_events_name_created_at ON public.billing_events USING btree (event_name, created_at DESC);


--
-- Name: idx_billing_events_provider_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_events_provider_subscription ON public.billing_events USING btree (provider, provider_subscription_id, created_at DESC) WHERE (provider_subscription_id IS NOT NULL);


--
-- Name: idx_bird_identifications_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bird_identifications_user_created_at ON public.bird_identifications USING btree (user_id, created_at DESC);


--
-- Name: idx_bird_identifications_user_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bird_identifications_user_updated_at ON public.bird_identifications USING btree (user_id, updated_at DESC);


--
-- Name: idx_conversation_summaries_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_summaries_latest ON public.conversation_summaries USING btree (conversation_id, version DESC);


--
-- Name: idx_conversations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_created_at ON public.conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- Name: idx_conversations_user_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user_last_message ON public.conversations USING btree (user_id, last_message_at DESC NULLS LAST, created_at DESC);


--
-- Name: idx_jobs_type_status_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_type_status_updated_at ON public.jobs USING btree (job_type, status, updated_at DESC);


--
-- Name: idx_jobs_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_user_created_at ON public.jobs USING btree (user_id, created_at DESC);


--
-- Name: idx_knowledge_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_document_id ON public.knowledge_chunks USING btree (document_id);


--
-- Name: idx_knowledge_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_embedding ON public.knowledge_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_knowledge_chunks_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_metadata ON public.knowledge_chunks USING gin (metadata);


--
-- Name: idx_knowledge_chunks_text_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_text_search ON public.knowledge_chunks USING gin (to_tsvector('simple'::regconfig, COALESCE(content, ''::text)));


--
-- Name: idx_knowledge_documents_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_active ON public.knowledge_documents USING btree (active);


--
-- Name: idx_knowledge_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_category ON public.knowledge_documents USING btree (category);


--
-- Name: idx_knowledge_documents_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_external_id ON public.knowledge_documents USING btree (external_id);


--
-- Name: idx_knowledge_documents_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_locale ON public.knowledge_documents USING btree (locale);


--
-- Name: idx_knowledge_documents_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_metadata ON public.knowledge_documents USING gin (metadata);


--
-- Name: idx_knowledge_documents_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_source ON public.knowledge_documents USING btree (source);


--
-- Name: idx_knowledge_documents_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_tags ON public.knowledge_documents USING gin (tags);


--
-- Name: idx_knowledge_documents_text_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_text_search ON public.knowledge_documents USING gin (to_tsvector('simple'::regconfig, ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(category, ''::text)) || ' '::text) || COALESCE((metadata ->> 'locations'::text), ''::text))));


--
-- Name: idx_knowledge_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_type ON public.knowledge_documents USING btree (document_type);


--
-- Name: idx_messages_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_created_at ON public.messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_provider_mappings_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_mappings_lookup ON public.provider_mappings USING btree (provider, provider_price_id, provider_product_id, provider_sku);


--
-- Name: idx_refresh_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active ON public.refresh_tokens USING btree (token_hash, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_reservation_state_audit_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservation_state_audit_conversation ON public.reservation_state_audit_events USING btree (conversation_id, new_version);


--
-- Name: idx_reservation_state_booking_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reservation_state_booking_key ON public.reservation_conversation_states USING btree (booking_idempotency_key) WHERE (booking_idempotency_key IS NOT NULL);


--
-- Name: idx_reservations_confirmation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_confirmation_code ON public.reservations USING btree (confirmation_code);


--
-- Name: idx_reservations_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_conversation_created_at ON public.reservations USING btree (conversation_id, created_at DESC);


--
-- Name: idx_reservations_email_calendar_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reservations_email_calendar_day ON public.reservations USING btree (lower(customer_email), tour_date) WHERE ((customer_email IS NOT NULL) AND (tour_date IS NOT NULL));


--
-- Name: idx_reservations_tour_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_tour_created_at ON public.reservations USING btree (tour_id, created_at DESC);


--
-- Name: idx_reservations_user_calendar_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reservations_user_calendar_day ON public.reservations USING btree (user_id, tour_date) WHERE ((user_id IS NOT NULL) AND (tour_date IS NOT NULL));


--
-- Name: idx_reservations_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_user_created_at ON public.reservations USING btree (user_id, created_at DESC, id DESC);


--
-- Name: idx_reservations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_user_id ON public.reservations USING btree (user_id);


--
-- Name: idx_tour_occurrences_bookable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_occurrences_bookable ON public.tour_occurrences USING btree (tour_id, starts_at, status, remaining_spaces);


--
-- Name: idx_tours_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_created_by_user_id ON public.tours USING btree (created_by_user_id);


--
-- Name: idx_tours_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_end_date ON public.tours USING btree (end_date);


--
-- Name: idx_tours_node_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_node_id ON public.tours USING btree (node_id);


--
-- Name: idx_tours_public_owner_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_public_owner_visibility ON public.tours USING btree (is_active, created_by_user_id);


--
-- Name: idx_tours_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_start_date ON public.tours USING btree (start_date);


--
-- Name: idx_tours_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_type_active ON public.tours USING btree (type, is_active);


--
-- Name: idx_usage_events_trace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_trace_id ON public.usage_events USING btree (trace_id) WHERE (trace_id IS NOT NULL);


--
-- Name: idx_usage_events_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_user_created_at ON public.usage_events USING btree (user_id, created_at DESC);


--
-- Name: idx_usage_events_user_feature_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_user_feature_created_at ON public.usage_events USING btree (user_id, feature, created_at DESC);


--
-- Name: idx_usage_logs_feature_reference_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_feature_reference_id ON public.usage_logs USING btree (feature, reference_id) WHERE (reference_id IS NOT NULL);


--
-- Name: idx_usage_logs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_usage_logs_id ON public.usage_logs USING btree (id);


--
-- Name: idx_usage_logs_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_user_created_at ON public.usage_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_usage_logs_user_feature_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_user_feature_created_at ON public.usage_logs USING btree (user_id, feature, created_at DESC);


--
-- Name: idx_user_memories_active_conflict_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_memories_active_conflict_key ON public.user_memories USING btree (user_id, category, conflict_key, created_at DESC) WHERE ((is_active = true) AND (conflict_key IS NOT NULL));


--
-- Name: idx_user_memories_active_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_memories_active_fingerprint ON public.user_memories USING btree (user_id, category, content_fingerprint) WHERE (is_active = true);


--
-- Name: idx_user_memories_active_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_memories_active_user ON public.user_memories USING btree (user_id, created_at DESC) WHERE (is_active = true);


--
-- Name: idx_user_subscriptions_provider_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_subscriptions_provider_customer ON public.user_subscriptions USING btree (billing_provider, provider_customer_id) WHERE ((billing_provider IS NOT NULL) AND (provider_customer_id IS NOT NULL));


--
-- Name: idx_user_subscriptions_provider_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_subscriptions_provider_subscription ON public.user_subscriptions USING btree (billing_provider, provider_subscription_id) WHERE ((billing_provider IS NOT NULL) AND (provider_subscription_id IS NOT NULL));


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: tour_cart_items_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tour_cart_items_user_id_idx ON public.tour_cart_items USING btree (user_id);


--
-- Name: tour_cart_one_tour_per_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tour_cart_one_tour_per_day ON public.tour_cart_items USING btree (user_id, scheduled_date) WHERE (scheduled_date IS NOT NULL);

--
-- Name: admin_audit_logs admin_audit_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: ai_feature_controls ai_feature_controls_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feature_controls
    ADD CONSTRAINT ai_feature_controls_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: bird_identifications bird_identifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bird_identifications
    ADD CONSTRAINT bird_identifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: birds_by_node birds_by_node_bird_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds_by_node
    ADD CONSTRAINT birds_by_node_bird_id_fkey FOREIGN KEY (bird_id) REFERENCES public.birds(id) ON DELETE CASCADE;


--
-- Name: birds_by_node birds_by_node_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birds_by_node
    ADD CONSTRAINT birds_by_node_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.node(id) ON DELETE CASCADE;


--
-- Name: conversation_summaries conversation_summaries_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: experiment_assignments experiment_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_chunks knowledge_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: node node_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node
    ADD CONSTRAINT node_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.node(id);


--
-- Name: node node_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node
    ADD CONSTRAINT node_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zone(id) ON DELETE CASCADE;


--
-- Name: plan_provider_mappings plan_provider_mappings_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_provider_mappings
    ADD CONSTRAINT plan_provider_mappings_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_provider_mappings plan_provider_mappings_provider_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_provider_mappings
    ADD CONSTRAINT plan_provider_mappings_provider_mapping_id_fkey FOREIGN KEY (provider_mapping_id) REFERENCES public.provider_mappings(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reservation_conversation_states reservation_conversation_states_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_conversation_states
    ADD CONSTRAINT reservation_conversation_states_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: reservation_conversation_states reservation_conversation_states_reservation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_conversation_states
    ADD CONSTRAINT reservation_conversation_states_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;


--
-- Name: reservation_state_audit_events reservation_state_audit_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_state_audit_events
    ADD CONSTRAINT reservation_state_audit_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.tour_occurrences(id);


--
-- Name: reservations reservations_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id);


--
-- Name: reservations reservations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: schedule_by_tour schedule_by_tour_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_by_tour
    ADD CONSTRAINT schedule_by_tour_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;


--
-- Name: schedule_by_tour schedule_by_tour_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_by_tour
    ADD CONSTRAINT schedule_by_tour_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tour_cart_items tour_cart_items_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_cart_items
    ADD CONSTRAINT tour_cart_items_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tour_cart_items tour_cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_cart_items
    ADD CONSTRAINT tour_cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tour_occurrences tour_occurrences_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_occurrences
    ADD CONSTRAINT tour_occurrences_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tour_provider_mappings tour_provider_mappings_provider_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_provider_mappings
    ADD CONSTRAINT tour_provider_mappings_provider_mapping_id_fkey FOREIGN KEY (provider_mapping_id) REFERENCES public.provider_mappings(id) ON DELETE CASCADE;


--
-- Name: tour_provider_mappings tour_provider_mappings_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_provider_mappings
    ADD CONSTRAINT tour_provider_mappings_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tours tours_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tours tours_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.node(id);


--
-- Name: transportation_by_node transportation_by_node_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_by_node
    ADD CONSTRAINT transportation_by_node_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.node(id) ON DELETE CASCADE;


--
-- Name: transportation_by_node transportation_by_node_transportation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_by_node
    ADD CONSTRAINT transportation_by_node_transportation_id_fkey FOREIGN KEY (transportation_id) REFERENCES public.transportations(id) ON DELETE CASCADE;


--
-- Name: usage_events usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: usage_logs usage_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_memories user_memories_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: user_memories user_memories_superseded_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_superseded_by_id_fkey FOREIGN KEY (superseded_by_id) REFERENCES public.user_memories(id) ON DELETE SET NULL;


--
-- Name: user_memories user_memories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: zone zone_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zone
    ADD CONSTRAINT zone_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE CASCADE;


-- Application-required tool result storage was absent from the inspected live
-- database, but both functions have verified query-layer callers.
CREATE TABLE public.tool_result_references (
    reference_id text PRIMARY KEY,
    conversation_code text NOT NULL,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    tool_name text NOT NULL,
    result jsonb NOT NULL,
    total_count integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT tool_result_references_expiration_check CHECK (expires_at > created_at),
    CONSTRAINT tool_result_references_total_count_check CHECK (total_count IS NULL OR total_count >= 0)
);

CREATE INDEX idx_tool_result_references_conversation
    ON public.tool_result_references (conversation_code, created_at DESC);
CREATE INDEX idx_tool_result_references_expiration
    ON public.tool_result_references (expires_at);

COMMIT;
