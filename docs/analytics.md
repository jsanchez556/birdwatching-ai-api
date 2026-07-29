# Product Analytics

Back to [Project Context](../CONTEXT.md).

Runtime product analytics uses `src/analytics/analytics.service.js`. Business
services depend only on its provider-neutral `track` contract; the PostHog SDK
is isolated in `src/analytics/posthog.provider.js`. Missing configuration
selects a no-op provider, and capture or shutdown failures never fail a product
operation.

## Event Catalog

| Event | Owner and successful trigger | Safe properties |
|---|---|---|
| `user_signed_up` | Auth service after the user and session are created | `plan`, `source`, `role` |
| `chat_started` | Frontend when a chat surface is opened | `plan`, `source`, `userType` |
| `chat_message_sent` | Chat service after a text or voice message is successfully processed and persisted | `conversationId`, `source`, `role`, `aiTraceId` |
| `bird_identification_started` | Bird-identification job service after a job is persisted and queued | `source`, `aiTraceId` |
| `bird_identification_completed` | Worker-side job service after the result is persisted | `source`, `status`, `aiTraceId` |
| `tour_recommended` | `searchTours` after a structured tour result succeeds with at least one tour; identical tour sets are deduplicated per conversation | `conversationId`, `plan`, `source`, `recommendationType`, `recommendationCount`, `aiTraceId`, optional `experiment`, `variant` |
| `tour_selected` | Availability service after a specific tour is resolved; deduplicated per conversation and tour; represents recommendation acceptance when experiment metadata is present | `conversationId`, `source`, `tourId`, `aiTraceId`, optional `experiment`, `variant` |
| `availability_checked` | Reservation service after a structured availability lookup succeeds | `conversationId`, `source`, `tourId`, `participants`, `availabilityResult`, `availableSlots`, `aiTraceId` |
| `reservation_started` | Reservation service after required inputs and the selected tour are validated; deduplicated per conversation, tour, and participant count | `conversationId`, `plan`, `source`, `tourId`, `participants`, `aiTraceId`, optional `experiment`, `variant` |
| `reservation_completed` | Reservation service after PostgreSQL persists the reservation; deduplicated by persisted reservation ID | `conversationId`, `plan`, `source`, `tourId`, `participants`, `amount`, `currency`, `aiTraceId`, optional `experiment`, `variant` |
| `checkout_started` | Checkout service after the hosted checkout session is created | `plan`, `source`, `billingProvider` |
| `subscription_activated` | Webhook service after a verified event produces an authoritative paid, entitled subscription | `plan`, `source`, `billingProvider`, `status`, `amount`, `currency` |

The frontend owns only `chat_started`; confirmed product outcomes are
server-owned to prevent duplicate semantic events.

## Identity and Idempotency

Authenticated events use the stable user ID as PostHog's `distinct_id`.
Unauthenticated completed chats use a conversation-scoped anonymous ID.
Verified billing events pass an internal idempotency key to the analytics
service. The service hashes it into PostHog's `$insert_id`, so raw provider
event IDs are not exported and webhook retries do not duplicate events.
Tour recommendations and reservation milestones use the same mechanism with
application-owned deterministic keys. Repeated delivery of the same successful
milestone does not inflate funnel counts, while a different recommended tour
set remains a separate product event.

## PostHog Funnel

Create an ordered funnel using unique users:

```text
chat_started
  -> tour_recommended
  -> reservation_started
  -> reservation_completed
```

Filter `environment` to the deployment being validated and choose an
appropriate conversion window for the booking cycle. Segment by `plan` or
`source` when comparing cohorts. Direct entry from a featured tour or cart can
skip `tour_recommended`; analyze those entry sources separately from the
discovery funnel.

## Privacy

The service removes non-primitive values and properties whose keys indicate
chat content, PII, credentials, or provider identifiers. Never send customer
names, email addresses, messages, prompts, responses, tokens, reservation
notes, raw provider payloads, or billing-provider object IDs.

Automated tests inject fake providers and do not send real events.

## Observability Responsibilities

- PostHog answers product questions such as what action a user took and which
  business milestone they reached.
- LangSmith owns AI-system behavior: model, prompt version, RAG usage, tool
  calls, cache status, latency, token usage, estimated cost, and evaluation
  scores.
- Application logs own technical execution, failures, retries, and operational
  diagnostics.

Do not export LangSmith trace payloads or application-log payloads to PostHog.
The only shared observability field is the opaque server-generated `aiTraceId`
UUID. It links a product event to its LangSmith root run without copying
prompts, responses, model telemetry, errors, or trace contents into PostHog.

For prompt experiments, PostHog receives only the safe experiment key and
variant needed to compare recommendation acceptance and reservation conversion.
LangSmith retains prompt version, evaluation score, latency, token usage, and
estimated cost.
