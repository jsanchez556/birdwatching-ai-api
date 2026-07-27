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
| `user_signed_up` | Auth service after the user and session are created | `plan`, `source`, `latencyMs`, `role` |
| `chat_started` | Frontend when a chat surface is opened | `plan`, `source`, `userType` |
| `chat_message_sent` | Chat service after a text or voice message is successfully processed and persisted | `conversationId`, `source`, `model`, `ragUsed`, `latencyMs`, `role` |
| `rag_query_executed` | RAG service after retrieval and grounding completes or safely falls back | `conversationId`, `source`, `model`, `ragUsed`, `latencyMs`, `retrievedChunkCount` |
| `bird_identification_started` | Bird-identification job service after a job is persisted and queued | `source`, `model` |
| `bird_identification_completed` | Worker-side job service after the result is persisted | `source`, `model`, `ragUsed`, `latencyMs`, `status` |
| `tour_recommended` | `searchTours` after a structured tour result succeeds with at least one tour; identical tour sets are deduplicated per conversation | `conversationId`, `plan`, `source`, `model`, `ragUsed`, `latencyMs`, `recommendationType`, `recommendationCount` |
| `tour_selected` | Availability service after a specific tour is resolved; deduplicated per conversation and tour | `conversationId`, `source`, `model`, `tourId` |
| `availability_checked` | Reservation service after a structured availability lookup succeeds | `conversationId`, `source`, `model`, `latencyMs`, `tourId`, `participants`, `availabilityResult`, `availableSlots` |
| `reservation_started` | Reservation service after required inputs and the selected tour are validated; deduplicated per conversation, tour, and participant count | `conversationId`, `plan`, `source`, `model`, `ragUsed`, `latencyMs`, `tourId`, `participants` |
| `reservation_completed` | Reservation service after PostgreSQL persists the reservation; deduplicated by persisted reservation ID | `conversationId`, `plan`, `source`, `model`, `ragUsed`, `latencyMs`, `tourId`, `participants`, `amount`, `currency` |
| `checkout_started` | Checkout service after the hosted checkout session is created | `plan`, `source`, `latencyMs`, `billingProvider` |
| `subscription_activated` | Webhook service after a verified event produces an authoritative paid, entitled subscription | `plan`, `source`, `billingProvider`, `status`, `amount`, `currency` |

The frontend owns only `chat_started`; confirmed product and AI outcomes are
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
