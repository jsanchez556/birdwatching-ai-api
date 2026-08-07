# Birdwatching AI API

## 1. Project overview

This repository is the server-side AI and domain platform for a Costa Rica nature-tour experience. It serves a React client with multi-category outdoor tour discovery, grounded birding answers, reservations, bird-image identification, voice conversation, account and billing workflows, and administrative operations and data maintenance.

The implementation is a Node.js 22/Express 5 application with a separately started BullMQ worker process. PostgreSQL is the durable source of truth; `pgvector` stores knowledge embeddings; Redis provides distributed rate-limit state, queue transport, and optional caches; OpenAI supplies text, embeddings, speech, and image analysis; S3/CloudFront holds public media; Stripe is the currently registered billing provider; LangSmith and PostHog are optional telemetry sinks.

The central design constraint is that probabilistic model output must not become transactional truth. Retrieval may degrade to an ungrounded path, tool failures are converted to structured results, and reservation confirmation is emitted only after the PostgreSQL write path succeeds.

The browser application lives in [birdwatching-ai-ui](https://github.com/jsanchez556/birdwatching-ai-ui). See [CONTEXT.md](./CONTEXT.md) for a source map, [docs/context-trust.md](./docs/context-trust.md) for context authority/freshness/isolation rules, and [docs/backend-guidelines.md](./docs/backend-guidelines.md) for repository conventions.

## 2. Capability status

Status is based on current code, migrations, tests, CI, and runtime configuration—not installed dependencies.

| Capability | Status | Evidence and limitation |
|---|---|---|
| Express API, normalized envelopes, auth, validation, and role checks | **Implemented** | Route/controller/middleware layers and Supertest coverage exist. Chat is optionally authenticated; durable history, cart, billing, jobs, ingestion, identification, and admin access are protected as appropriate. |
| OpenAI text generation and streamed chat | **Implemented** | Agent orchestration streams through SSE, records usage, applies input/output guardrails, and accepts abort signals. No latency or availability result is established. |
| PostgreSQL/pgvector RAG | **Implemented, corpus-dependent** | Hybrid semantic/keyword retrieval, filters, context assembly, ingestion, embeddings, cache fallback, migrations, and tests exist. Useful grounding requires migrations plus ingested documents. |
| Durable and short-term memory | **Implemented** | Owner-aware conversations/messages provide short-term history. Authenticated users also have conservative, source-linked structured memories in allowlisted categories; visitors do not. Anonymous continuity depends on a client-held conversation ID. |
| Structured multi-tool orchestration | **Implemented** | Deterministic planning, schema/argument validation, registered tool handlers, intermediate state, retry policy, tracing, and transactional reservation tooling are tested. It is one agent with multi-step tools, not a distributed multi-agent system. |
| Nature-tour catalog and maintenance | **Implemented** | Required activity categories, country-owned initial map center/zoom, public filtering, and admin CRUD for countries, zones, nodes, birds, assignments, and tours are backed by PostgreSQL migrations and protected REST endpoints. Tour coordinates are node-owned, synchronized by database triggers, and forward/reverse node location lookup is proxied through an admin-only open-geocoder adapter. |
| Guide ownership and roles | **Implemented** | Owner-scoped My Tours APIs, legacy system inventory, suspended-owner public filtering, and audited administrator role changes are enforced server-side. |
| Bird image identification | **Implemented** | Authenticated URL/upload intake, quota reservation, durable job records, BullMQ processing, uncertainty-aware structured output, polling, and tests exist. Queue/OpenAI/S3 configuration is required for the complete path. |
| Voice chat | **Implemented, optional** | Raw MP3/WAV validation, STT, normal chat orchestration, TTS, S3 upload, media reference, tracing, and route tests exist. It is synchronous and non-streaming. |
| Redis caching | **Implemented, optional for AI cache** | Exact response, semantic response, embedding, and retrieval caches are wired and tested; cache failures fall back to OpenAI or PostgreSQL. Redis is nevertheless required by queue and readiness wiring. |
| BullMQ queues and workers | **Implemented; deployment wiring is partial** | Identification, ingestion, embedding, retries, retention, event tracing, and optional DLQ exist with worker tests. A second service/process must be configured manually; `railway.json` does not declare both start commands. |
| LangSmith tracing | **Implemented, optional** | Sanitized HTTP/agent/tool/cache/voice/background trace helpers and tests exist. Export is disabled without configuration. |
| AI evaluations and prompt regression | **Partial or experimental** | Deterministic scorers, a 100-case labeled dataset, prompt/evaluation runners, CI, and a real-output gate exist. The checked-in real-pipeline baseline is explicitly `unavailable`; synthetic scores validate scorers only and are not model/RAG quality evidence. |
| PostHog analytics and feature flags | **Implemented, optional** | Server events, feature values, experiment assignment persistence, failure isolation, and tests exist. Missing PostHog config falls back to checked-in defaults; critical admin controls use PostgreSQL overrides. |
| Stripe billing and webhooks | **Implemented, provider-limited** | Checkout, portal, signature verification, normalized events, idempotent event recording, subscription sync, simulator, and tests exist. Stripe is the only concrete provider, and live-provider operation is not verified by repository tests. |
| Usage metering, plan quotas, feature controls, and cost reporting | **Implemented with limits** | Daily atomic quota reservation, usage/cost records, admin feature economics, and temporary controls exist. There is no separate configurable monetary-budget cutoff or automatic spend circuit breaker. |
| Production scale, availability, quality, or cost outcomes | **Not verified** | No repository evidence supports traffic, latency, SLO, accuracy, calibration, throughput, or savings claims. |

## 3. Architecture at a glance

| Boundary | Responsibility | Important paths |
|---|---|---|
| HTTP | Routing, raw/body upload parsing, auth, schema validation, rate limiting, envelopes, SSE | [`src/api/`](./src/api) |
| Application services | Chat lifecycle, conversation context, RAG, billing, usage, cart, identification, ingestion | [`src/services/`](./src/services) |
| AI runtime | Prompts, client, agent, planner, tools, schemas, audio, embeddings, guardrails | [`src/ai/`](./src/ai) |
| Persistence | Pool, parameterized queries, repositories, SQL functions, migrations | [`src/db/`](./src/db) |
| Async execution | Queue registration, job policy, events, workers, DLQ | [`src/queues/`](./src/queues), [`src/workers/`](./src/workers), [`src/jobs/`](./src/jobs) |
| Cache | Lazy Redis client, response/semantic/embedding/retrieval caches | [`src/cache/`](./src/cache) |
| Providers | Billing and external source adapters, object storage | [`src/providers/`](./src/providers), [`src/storage/`](./src/storage), [`src/ingestion/clients/`](./src/ingestion/clients) |
| Operations | Structured logs, traces, AI telemetry, analytics, health, shutdown | [`src/observability/`](./src/observability), [`src/tracing/`](./src/tracing), [`src/monitoring/`](./src/monitoring), [`src/runtime/`](./src/runtime) |
| Quality | Deterministic tests, datasets, scorers, regression runners, dashboards | [`__tests__/`](./__tests__), [`src/evaluations/`](./src/evaluations) |

Controllers translate HTTP into application calls. Services own workflows. Repositories and query modules own persistence. The AI layer cannot bypass the reservation service/database function to create durable bookings.

## 4. System architecture diagram

Shows the API/worker process boundary and the different roles of durable storage, queue/cache state, and external providers.

```mermaid
flowchart LR
  subgraph Browser["Browser trust boundary"]
    UI["React UI"]
  end

  subgraph API["API process"]
    HTTP["HTTP middleware"]
    Services["Domain services"]
    Agent["RAG and agent"]
    Producer["Queue producers"]
  end

  subgraph Worker["Worker process"]
    Consumers["BullMQ workers"]
    Async["Image and ingestion"]
  end

  PG[("PostgreSQL and pgvector")]
  Redis[("Redis and BullMQ")]
  OpenAI["OpenAI"]
  Media["S3 and CloudFront"]
  Stripe["Stripe"]
  Telemetry["LangSmith and PostHog"]

  UI -->|"JSON requests"| HTTP
  HTTP -->|"SSE stream"| UI
  HTTP --> Services
  Services --> Agent
  Services --> PG
  Services --> Redis
  Services --> Stripe
  Services --> Media
  Services --> Producer
  Agent --> OpenAI
  Agent --> PG
  Producer --> Redis
  Redis --> Consumers
  Consumers --> Async
  Async --> OpenAI
  Async --> PG
  Services -.-> Telemetry
  Consumers -.-> Telemetry
```

Reading notes:

- The API and worker share a runtime artifact but start as separate processes.
- PostgreSQL is the durable source of truth; Redis holds rate-limit, cache, queue, and retained BullMQ state.
- OpenAI, media, billing, and telemetry integrations require explicit configuration and are not implied to be live in every deployment.

## 5. End-to-end request lifecycle

### Grounded streamed chat

1. Global security/CORS/sanitization and distributed rate limiting run before the route.
2. `POST /chat` applies optional JWT auth, a visitor or authenticated AI limit, body validation, atomic daily quota reservation for authenticated users, and an AI trace ID.
3. `chat.service` resolves role, applies input guardrails, merges authenticated identity into customer context, and loads recent owner-aware conversation messages/metadata.
4. `rag.service` normalizes the query, selects a retrieval feature variant, and requests an embedding plus hybrid pgvector results. Retrieval/cache failures are logged and produce empty grounding context rather than failing chat.
5. The agent planner derives a deterministic multi-step plan. Feature controls can prevent booking tools; persisted experiment assignment selects the recommendation prompt variant.
6. The tool executor validates arguments, carries intermediate selection/pricing state, retries classified transient failures, and stops dependent steps after a terminal error. Reservation creation delegates to the transactional database path.
7. The OpenAI client streams the final response. Output guardrails buffer enough content to block or replace unsafe output before completion.
8. SSE `start`, `chunk`/`replace`, and `done` events return text plus safe metadata. Client disconnect aborts the server controller and propagates the signal toward model work.
9. Conversation/output metadata and usage are persisted. Analytics and trace export are non-blocking optional sinks.

### Asynchronous image identification

1. `POST /birds/identify` requires auth, an enabled feature, AI rate limit, supported raw image or URL input, quota, and trace assignment.
2. Uploaded bytes are validated and stored; a durable `jobs`/identification record is created before BullMQ enqueue.
3. The worker marks the job active, invokes structured vision analysis, retrieves/reranks supporting bird evidence, calibrates the result to `identified`, `uncertain`, or `unknown`, and stores the result.
4. BullMQ applies exponential retry. Non-retryable payload errors stop immediately; final failures update PostgreSQL and can enter the sanitized DLQ.
5. The authenticated owner polls `GET /jobs/:id`. Stalled job records are converted to a failed state after the configured timeout.

## 6. Core AI capabilities

### OpenAI integration

[`src/ai/clients/openai.client.js`](./src/ai/clients/openai.client.js) and focused services provide streamed chat completions, embeddings, speech-to-text, text-to-speech, and structured image analysis. Model names are environment-controlled. Retry classification includes timeouts and selected 4xx/5xx provider statuses while explicit aborts are not retried.

Input and output guardrails are deterministic policy checks, not a general safety guarantee. Provider errors are normalized and logged without returning raw stacks or credentials.

### Grounding

RAG context is a separate message assembled from retrieved chunks and source metadata. It is not appended to durable user-authored content. The final response records retrieval status and trace metadata so evaluation can distinguish grounded, empty, and failed retrieval.

### Transactional boundary

Tour discovery, availability, transportation, and price calculation may inform model text, but `createReservation` succeeds only after argument validation and the PostgreSQL reservation function completes. The final prompt explicitly forbids a confirmation when the durable write failed.

## 7. Frontend architecture

The companion React application owns product composition, input validation for usability, SSE decoding, progressive rendering, browser cancellation, local transcript/session caching, voice capture/WAV encoding, image submission/polling, and provider-neutral billing redirects.

The API never trusts frontend roles, quota state, feature availability, reservation state, payment returns, upload metadata, or validation. All are re-established server-side. See the [frontend repository](https://github.com/jsanchez556/birdwatching-ai-ui) for the browser architecture and exact consumer behavior.

## 8. Backend architecture

### HTTP routes

| Area | Representative routes | Access |
|---|---|---|
| Health | `GET /health`, `/health/live`, `/health/ready` | Public |
| Homepage/media | `GET /homepage/hero`, `/tours`, `/birds/highlights`, `/birds/profile`, `/addons/transportation`, `/files/:folder/:filename` | Public |
| Auth/profile | `POST /auth/signup`, `/login`, `/refresh`, `/logout`; `PATCH /auth/profile`; `POST /auth/profile-image` | Profile mutations require auth |
| Chat | `POST /chat`; `GET /chat/latest`, `/chat/:conversationId` | Stream optional auth; history requires auth |
| Voice | `POST /voice-chat` | Optional auth, feature flag, AI limit/quota |
| Identification/jobs | `POST /birds/identify` (plus compatibility `/bird-identification`); `GET /jobs/:id` | Auth |
| Cart/reservations | `/cart`, `/cart/items`, `/cart/reservations` | Auth |
| Ingestion | `POST /ingestions`, `GET /ingestions/:id` | Auth; current route does not require admin role |
| Billing | Checkout, portal, usage, admin dashboard/economics/simulator, provider webhook | User/admin/public webhook as appropriate |
| Feature availability | `GET /features/availability` | Public |
| Admin operations | Metrics, users, subscriptions, queue/errors, job retry, feature control, suspension, and `PUT /admin/tours/:tourId/image` | Auth plus admin |

JSON responses use `{ success, data, meta }`. Error middleware emits safe normalized failures and includes stack details only in server logs, not public responses. Chat streams named SSE events instead of the JSON envelope.

### Service and repository rules

- Route middleware owns trust-boundary checks.
- Controllers translate protocol data and select status/envelope behavior.
- Services coordinate workflows and domain invariants.
- Query/repository modules use parameterized SQL and database functions.
- External adapters normalize provider-specific responses before domain services consume them.
- Cross-process work carries stable IDs; durable status is read from PostgreSQL rather than inferred solely from BullMQ.

## 9. RAG and conversational memory

### Ingestion and storage

Migration `001_schema.sql` enables `vector` and creates `knowledge_documents` plus chunk embeddings and metadata/text indexes. Document ingestion:

1. validates normalized JSON documents;
2. persists document identity and metadata;
3. chunks text;
4. generates embeddings;
5. writes vectors to PostgreSQL, synchronously through enrichment or through ingestion/embedding jobs.

`npm run enrich -- birds` refreshes supported eBird, iNaturalist, Xeno-canto, and wiki-derived files according to source-specific age rules, regenerates `birds.json`, then ingests it. External clients are rate-limited and independently tested. Chat requests never mutate the corpus.

### Retrieval

The vector repository combines cosine similarity with PostgreSQL text search, normalizes semantic/keyword weights, supports metadata filters, applies score thresholds, and returns an expanded media-aware candidate pool. Before prompt assembly, the RAG selector applies permission/currentness filters, polarity-aware near-deduplication, query/verification/recency reranking, contradiction detection, extractive compression, document diversification, and a hard token/result budget. Selected passages retain `[R#]`, source, document, and chunk citations. Query embeddings and retrieval results can be cached in Redis using permission-scoped keys. Any cache error falls through; a PostgreSQL/vector error is recorded as degraded RAG and chat continues without retrieved context.

### RAG request flow

Shows how validated chat input becomes grounded context while preserving explicit cache and retrieval degradation paths.

```mermaid
flowchart TD
  Request["Chat request"] --> Validate["Auth, limits, schema"]
  Validate --> Memory["Recent memory"]
  Memory --> Normalize["Normalize query"]
  Normalize --> Embed["OpenAI embedding"]
  Embed -.->|"embedding failure"| Empty["Empty RAG context"]
  Embed --> Cache["Retrieval cache"]
  Cache -->|"hit"| Assemble["Context assembly"]
  Cache -->|"miss"| Hybrid["Hybrid pgvector search"]
  Cache -.->|"cache failure"| Hybrid
  Hybrid --> Filter["Metadata and permission filter"]
  Filter --> Dedup["Near-deduplicate"]
  Dedup --> Rerank["Rerank and detect contradictions"]
  Rerank --> Compress["Compress and enforce RAG budget"]
  Compress --> Assemble
  Hybrid -.->|"retrieval failure"| Empty
  Assemble --> Agent["Agent execution"]
  Empty --> Agent
  Agent --> Model["OpenAI stream"]
  Model --> SSE["SSE response"]
  Model --> Persist[("Messages and usage")]
  Model -.-> Trace["Sanitized trace"]
```

Reading notes:

- Hybrid search combines embedding similarity with PostgreSQL text search; PostgreSQL/pgvector is authoritative.
- Candidate retrieval is deliberately wider than final model context; only selected, citation-bearing passages enter prompt assembly.
- Redis failures bypass caching, while retrieval failures continue with an empty context and degraded metadata.
- Conversation memory and usage are persisted separately from the retrieved prompt context.

### Memory

- `conversations` and `messages` store durable owner-aware history.
- `user_memories` stores active/non-expired authenticated user preferences and constraints separately from transcripts, RAG, and reservation state.
- Structured extraction rejects weak inferences and unsafe/transient data; exact active duplicates are idempotent and explicit corrections preserve inactive superseded rows.
- Retrieval embeds the current request with eligible candidates, applies confidence/age/expiry and semantic-similarity thresholds, deduplicates normalized content, and caps both results and memory tokens before ContextBuilder's task/model budget.
- Same-category, same-axis conflicts resolve only through explicit recent correction. Superseded rows remain inactive audit history; uncertain conflicts are not written and require clarification.
- SQL helpers atomically ensure conversations and save turn pairs.
- Recent turns form short-term context with bounded selection in the conversation service.
- JSONB conversation metadata carries selections and booking continuity across turns.
- Authenticated history reads enforce ownership.
- Anonymous chat can maintain continuity by presenting its conversation ID, but does not gain authenticated history lookup.

The repository implements no automated retention purge. Review [docs/privacy-retention.md](./docs/privacy-retention.md) before using stored conversations, uploads, traces, or analytics in a regulated context.

## 10. Agent orchestration and tool execution

The current runtime is a single domain agent with deterministic multi-tool planning:

| Tool | Responsibility | Persistence/failure boundary |
|---|---|---|
| `searchTours` | Search or recommend tours by location, budget, difficulty, group, or price | Parameterized PostgreSQL reads; empty matches remain structured. |
| `checkAvailability` | Resolve tour and availability for dates/group | Does not reserve inventory. |
| `calculateTransportation` | Calculate selected transportation details | Requires normalized location/selection context. |
| `calculatePricing` | Calculate base, group/code discount, and transportation totals | Server calculation is authoritative; still not a booking. |
| `createReservation` | Commit the validated selection/customer/dates/pricing path | Transactional PostgreSQL function, row locking/constraints, confirmation only on success. |

Schemas and handlers are registered together so a missing handler or duplicate tool fails registration. The planner constructs dependent steps; the executor stores intermediate results, validates arguments, records trace events, retries transient results/errors twice by default with exponential delay, and marks remaining steps skipped after a blocking failure.

Oversized tool outputs are stored for seven days behind opaque, user/conversation-scoped references. Dependent plan steps keep the complete request-local value, while model context receives at most five allowlisted rows plus totals, pagination, omitted counts, and the result reference. Internal margins, supplier/database fields, raw provider details, credentials, queries, and diagnostics are never copied into the compact prompt projection.

The OpenAI model is used to produce the final natural-language answer, not to choose arbitrary executable code. Unknown tools and invalid arguments return controlled structured failures.

Context assembly records content-free provenance for every candidate and returns
it on planning, generation, and final LLM traces. Source IDs, retrieval time,
trust, expiry/validity, original-content hashes, transformations, and selection
outcomes remain internal; non-enumerable sidecars preserve them across assembly
passes without adding fields to provider messages or public chat responses.

### AI agent tool-execution flow

Shows the deterministic planning and execution boundary that separates model language from transactional outcomes.

```mermaid
flowchart TD
  Intent["User intent"] --> PlanInput["Planning input"]
  PlanInput --> Planner["Deterministic planner"]
  Flags["Feature controls"] --> Planner
  Planner --> Plan["Ordered tool plan"]
  Plan -.->|"no tools"| Final["Final prompt"]
  Plan --> Validate["Validate arguments"]
  Validate --> Execute["Execute next tool"]
  Execute --> State["Intermediate state"]
  State --> More{"More steps?"}
  More -->|"yes"| Validate
  Execute -.->|"retryable"| Retry["Bounded retry"]
  Retry --> Execute
  Execute -.->|"terminal"| Stop["Skip dependents"]
  Execute -->|"reservation"| Tx["PostgreSQL transaction"]
  More -->|"no"| Final
  Stop --> Final
  Tx --> Final
  Final --> Model["Streamed answer"]
```

Reading notes:

- Planning is constrained by registered schemas, current conversation state, feature controls, and deterministic rules.
- Retryable failures use bounded backoff; terminal failures stop dependent steps and enter the final prompt as failure context.
- Only a successful PostgreSQL reservation transaction can support a confirmed booking; model wording alone cannot.

## 11. Streaming and multimodal workflows

### SSE and cancellation

The server sets SSE headers, emits JSON event payloads, and closes the stream exactly once. A response `close` event aborts active processing. The signal reaches orchestration/model calls; abort errors are excluded from retry. Cancellation is best-effort across external calls and cannot undo a database transaction that already committed.

### Voice

`POST /voice-chat` accepts raw `audio/mpeg`, `audio/mp3`, `audio/wav`, or `audio/x-wav` with a compatible `X-Filename`. Context headers are parsed and validated. The service:

1. transcribes audio;
2. reuses conversation/RAG/agent orchestration;
3. synthesizes MP3;
4. stores it under the S3 `voice-chat/` prefix;
5. returns transcript, answer, and a relative `/files/voice-chat/...` reference.

Failure at any required stage fails the synchronous request. There is no partial audio streaming or durable voice job.

### Images

Image uploads are capped and type-validated by middleware, then stored before queued analysis. Vision output is schema-validated and combined with retrieved evidence. Calibration preserves explicit uncertainty; repository tests cover contradictory, low-confidence, and unknown outcomes. Those tests do not establish real-world identification accuracy.

## 12. Background processing and caching

### BullMQ

Queues: `bird-identification`, `ingestion`, `embedding`, and `dead-letter`.

### Asynchronous worker flow

Shows how durable job or document state surrounds BullMQ’s retryable delivery path for image identification, ingestion, and embeddings.

```mermaid
flowchart TD
  Request["API request"] --> API["Validate and authorize"]
  API --> State[("Job or document state")]
  State --> Producer["BullMQ producer"]
  Producer --> Redis[("Redis queue")]
  Redis --> Worker["Worker processor"]
  Worker --> Kind{"Job type"}
  Kind --> Image["Image analysis"]
  Kind --> Ingest["Ingestion"]
  Kind --> Embed["Embedding"]
  Image --> OpenAI["OpenAI"]
  Ingest --> OpenAI
  Embed --> OpenAI
  Image --> Result[("Update durable state")]
  Ingest --> Result
  Embed --> Result
  Result --> State
  Worker -.->|"retry and backoff"| Redis
  Worker -.->|"terminal failure"| DLQ["Sanitized DLQ"]
  Client["Authenticated client"] -.->|"poll queued jobs"| API
```

Reading notes:

- PostgreSQL job records provide identification/ingestion status; embedding jobs update durable document chunks rather than a public job record.
- Unsupported or invalid payloads are non-retryable; classified transient failures use exponential backoff.
- The worker has no public HTTP listener, and BullMQ delivery is not documented as exactly once.

The shared default is three attempts with exponential backoff from 5 seconds, completion retention of one day/1,000 jobs, failure retention of seven days/5,000 jobs, and worker concurrency two. Environment variables can change these values. Unrecoverable payload errors do not retry. Queue/worker events update structured telemetry; sanitized terminal failures can be copied to the DLQ.

API startup registers producers/events. Worker startup registers the same queues plus processors, sets `autorun: false`, then starts all workers. Both processes close queues, Redis, and PostgreSQL during bounded shutdown.

### Redis

Redis serves three distinct roles:

- distributed fixed-window rate-limit counters;
- BullMQ transport and retained job state;
- optional exact AI response, semantic response, embedding, and retrieval caches.

AI cache lookup/write failures log and fall back. Cache eligibility excludes authenticated, conversation-specific, reservation, tool, and otherwise sensitive metadata. Semantic reuse is bounded by TTL, similarity threshold, prompt-versioned index key, and maximum entry count. PostgreSQL and provider calls remain authoritative.

Although AI caching degrades safely, the current readiness check treats Redis/queue connectivity as required, and background workflows cannot operate without Redis.

## 13. Observability, analytics, and AI evaluations

### Runtime observability

- Winston emits structured console logs; optional file transports are disabled by default.
- HTTP completion logs include method, normalized route, status, duration, and AI trace ID.
- AI spans cover request flow, conversation context, RAG, agent planning, tool execution, cache operations, voice stages, and errors.
- Background traces cover enqueue, queue events, and worker execution.
- LangSmith export uses case/trace IDs, counts, status, latency, token, cost, and sanitized metadata; raw prompts, answers, retrieved text, secrets, and PII are excluded from production trace metadata by design.
- PostHog analytics and feature values fail open to application behavior; provider shutdown is part of graceful termination.
- Admin views combine durable usage/billing/job data with an explicitly partial replica-local operational error feed.

No repository evidence proves an external dashboard is configured or receiving data.

### Deterministic tests versus AI evaluation

`npm test` verifies software behavior with mocks/fixtures: routes, validation, SQL/query contracts, planners/tools, retries, caches, queues/workers, billing/webhooks, tracing, and evaluation math.

`npm run ai:evals:self-test` constructs synthetic answers/chunks from labels and validates scorer implementation only.

`npm run ai:evals -- --results path/to/real-output-artifact.json` validates a sanitized artifact captured from the actual pipeline against the golden dataset and provenance schema. It fails when the artifact is absent. The checked-in `ai-eval-baseline.json` is marked `unavailable`, so this repository currently contains no verified model/RAG quality result. See [docs/testing.md](./docs/testing.md).

## 14. Billing and AI cost governance

Internal plan, subscription, quota, usage, and feature-economics models are provider-neutral. Stripe is the only concrete provider adapter.

### Billing and subscription lifecycle

Shows the verified-webhook path that converts provider activity into durable entitlement, quota, and reporting state.

```mermaid
flowchart TD
  User["Authenticated user"] --> API["Billing API"]
  API --> Session["Plan mapping and session"]
  Session --> Stripe["Stripe checkout"]
  Stripe -->|"browser redirect"| Return["Return notice"]
  Return -.-> NoGrant["Not entitlement"]
  Stripe -->|"signed webhook"| Verify["Verify and normalize"]
  Verify --> Event[("Record event ID")]
  Event -->|"new or replayable"| Sync["Sync subscription"]
  Event -.->|"processed duplicate"| Ack["Acknowledge"]
  Sync --> Subscription[("Subscription state")]
  Subscription --> Quota["Entitlements and quotas"]
  Quota --> Usage[("Usage and cost")]
  Usage --> Reports["Billing reports"]
  Sync -.-> Analytics["Subscription analytics"]
```

Reading notes:

- Checkout is provider-hosted, but only a verified and normalized webhook can change durable subscription state.
- Provider event IDs support idempotent duplicate handling; webhook processing is synchronous rather than queue-backed.
- Daily quotas reserve access before AI execution, while usage/cost records feed user, admin, and feature-economics reports.

Implemented mechanisms:

- Hosted checkout and customer-portal session creation.
- HMAC SHA-256 webhook signature verification with timestamp tolerance and timing-safe comparison.
- Provider event normalization and a unique provider/event ID record before subscription side effects.
- Duplicate processed-event recognition and processed timestamps.
- Subscription status/plan synchronization and provider mapping tables.
- Admin-only payment simulation for deterministic QA without a live provider.
- Atomic per-user daily quota reservation for `chat` and `identification`; quota rejection occurs before the billable path.
- Usage records containing tokens, model, estimated cost, feature, trace, and cache metadata.
- User/admin billing dashboards and per-feature estimated contribution economics.
- Temporary database-backed shutdown controls for voice, multimodal identification, and agent booking.

Limitations:

- Visitor quota behavior is rate-limit based; persistent plan quota reservation applies to authenticated users.
- The usage reservation happens before execution and is not described as refunded on downstream failure.
- Cost values are estimates derived from recorded metadata, not reconciled provider invoices.
- No monetary budget threshold automatically stops AI spending.
- Webhook event recording and subsequent subscription synchronization are separate steps; replay handles duplicates, but the repository does not implement a dedicated webhook queue.
- Live Stripe behavior and financial reporting accuracy are not established by tests.

## 15. Reliability and security considerations

Implemented controls:

- Helmet headers, explicit CORS allowlist, 64 KB JSON limit, upload limits, request sanitization, schema validators, and parameterized queries.
- Password hashing, signed access tokens, hashed durable refresh tokens, revocation, expiry, suspension checks, and admin role middleware.
- Redis-backed global/authenticated/visitor limits with atomic increment/expiry and standard rate-limit headers.
- `RATE_LIMIT_REDIS_FAILURE_MODE=local` falls back to a bounded per-replica limiter; `deny` returns a generic 503.
- Provider/model/tool retry classification excludes aborts and known permanent failures.
- PostgreSQL functions, constraints, locks, and transactions protect reservation and quota invariants.
- Billing webhook signatures and provider-event uniqueness reduce spoofing and duplicate processing.
- Sensitive trace/tool/DLQ metadata is redacted or allowlisted; public errors omit stacks/provider secrets.
- Database TLS defaults to hostname-verifying `verify-full` in production; local development defaults to disabled TLS.
- Liveness and dependency-aware readiness are separate.
- SIGTERM/SIGINT shutdown is idempotent and bounded for API and worker resources.

Important limitations:

- JWT access tokens are bearer credentials; the current UI stores them in browser `localStorage`.
- Empty `CORS_ORIGINS` emits no browser allow-origin header; CORS is not authentication.
- `DATABASE_SSL_MODE=require` encrypts without authenticating the server and is intended only as a migration bridge.
- The authenticated ingestion route does not currently require admin role.
- Rate-limit local fallback weakens cross-replica enforcement.
- In-memory operational error state is replica-local and does not observe a separate worker’s memory.
- There is no checked-in WAF, secret manager integration, automated retention job, audit certification, SLO, backup policy, or disaster-recovery procedure.

## 16. Testing strategy

Run the complete deterministic suite with:

```bash
npm test
```

| Test class | Evidence |
|---|---|
| Unit/service | Chat, RAG, prompts, guardrails, retrieval, chunking, embeddings, identification, billing, quotas, analytics, health, and shutdown. |
| API contract | Supertest coverage for auth, homepage, chat/SSE, voice, image/jobs, ingestion, billing, health, admin, feature middleware, and error behavior. |
| Database/query | Parameterized query shapes, SQL helper use, migration regression checks, pgvector query composition, reservation and billing event semantics. Most tests mock the pool rather than run a live PostgreSQL instance. |
| Agent/tool | Planner stages, registry integrity, argument validation, retries, tool result state, feature gating, reservation boundary, and deterministic prompt variants. |
| Queue/worker | BullMQ config, manager/events, DLQ sanitization, each processor, retry/final-failure semantics, and shutdown. Tests use doubles, not a live Redis cluster. |
| Billing/webhook | Provider mapping, checkout, portal, signature paths, idempotent event handling, simulator, subscription sync, and admin dashboards. |
| AI quality software | Scorers, retrieval metrics, prompt comparison, portfolio artifact validation, LangSmith dashboard aggregation, and provenance rules. |
| Cross-repository | The UI-owned runner is intended to connect the production SSE emitter to the production UI parser without providers, but it currently fails because of an extensionless UI ESM import and a stale expected normalized shape. It is partial, not passing evidence. |
| CI | Pull requests are configured to install, test, build/verify the runtime artifact, and run the shared stream contract; the contract defect above prevents claiming a fully passing workflow. A separate workflow requires a configured real-output artifact for AI regression. |

Gaps: the default suite does not prove live PostgreSQL/Redis/OpenAI/S3/Stripe/LangSmith/PostHog integration, model quality, concurrency under load, or production migration rollback.

## 17. Local development

### Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL with the `vector` extension available
- Redis for queues, workers, readiness, and optional caches
- An OpenAI API key

S3/CloudFront, Stripe, LangSmith, PostHog, and external bird-data APIs are optional unless exercising their workflows.

### Run Redis with Docker

The local Redis image uses the lightweight Redis Alpine image, enables append-only persistence, and includes a health check. Build it from the repository root:

```bash
docker build -f Dockerfile.local -t birdwatching-redis-local .
```

Before starting the container, confirm that port `6379` is not already published by another Docker container:

```bash
docker ps --filter publish=6379 --format 'table {{.Names}}\t{{.Ports}}'
```

If the port is already in use, stop the conflicting container or service before continuing. Run Redis with its port bound only to the local machine and its data stored in a named volume:

```bash
docker run --name birdwatching-redis \
  --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  -v birdwatching-redis-data:/data \
  -d birdwatching-redis-local
```

Verify that Redis responds:

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

The expected response is `PONG`. The backend must use the matching local URL:

```dotenv
REDIS_URL=redis://localhost:6379
```

Manage the container with:

```bash
docker stop birdwatching-redis
docker start birdwatching-redis
docker restart birdwatching-redis
docker rm birdwatching-redis
```

Run `docker rm` only after stopping the container. Removing the container does not remove the `birdwatching-redis-data` volume, so cached and queued Redis data survives container replacement. To intentionally erase that local data after removing the container, run `docker volume rm birdwatching-redis-data`.

### Install and configure

```bash
npm ci
```

Create a local `.env` with at least:

```dotenv
NODE_ENV=development
PORT=3001
OPENAI_API_KEY=replace-locally
DATABASE_URL=postgresql://user:password@localhost:5432/birdwatching
DATABASE_SSL_MODE=disable
JWT_SECRET=replace-with-a-long-local-secret
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:5173
```

These are illustrative placeholders, not repository credentials.

### Apply database migrations

There is no migration runner script. Apply every file in [`src/db/migrations/`](./src/db/migrations) in numeric order with `psql` or the deployment platform’s database tooling. The current sequence is `001` through `029`; `011` contains seed data. For example, from a shell that has `DATABASE_URL`:

```bash
for migration in src/db/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || break
done
```

The lexicographically sorted zero-padded filenames preserve migration order.

### Start API and workers

```bash
npm run dev
```

Or run the processes separately:

```bash
npm run dev:api
npm run dev:worker
```

The React development proxy expects the API at `http://localhost:3001` by default.

### Optional corpus ingestion

```bash
npm run enrich -- birds
```

This requires the vector schema, OpenAI embeddings, and configured external provider endpoints/keys needed by the refresh path.

### Test, evaluate, and build

```bash
npm test
npm run ai:evals:self-test
npm run ai:evals -- --results path/to/sanitized-real-output-artifact.json
npm run build
npm run verify:artifact
```

`npm run build` copies an explicit runtime allowlist into `dist/` and already invokes artifact verification. Production start commands run from `dist/`:

```bash
npm run start:api
npm run start:worker
```

## 18. Environment variables

Variables below are referenced by executable code/configuration. “Optional capability” means the primary API can start without it, but that workflow cannot complete.

### Backend/API and PostgreSQL

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `NODE_ENV` | No | Global config/TLS/logging | `development`, `test`, or `production` | `development`. |
| `PORT` | No | API server | Listen port | `3001`. |
| `DATABASE_URL` | Yes | PostgreSQL pool | Durable application and vector database | No safe shared value; local PostgreSQL URL. |
| `DATABASE_SSL_MODE` | Production | PostgreSQL TLS | `disable`, `require`, or `verify-full` | Development: `disable`; production default: `verify-full`. |
| `DATABASE_SSL_CA_BASE64` | No | PostgreSQL TLS | Base64 private CA | Mutually exclusive with file; secret-store value. |
| `DATABASE_SSL_CA_FILE` | No | PostgreSQL TLS | Mounted CA path | Mutually exclusive with base64. |
| `JWT_SECRET` | Yes | Auth tokens | Sign/verify access tokens | No default outside tests; use a long local secret. |
| `JWT_EXPIRES_IN` | No | Auth service | Access-token lifetime | `7d`. |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | No | Auth service | Durable refresh-token lifetime | `30`. |
| `ADMIN_EMAIL` | No | Auth bootstrap | Comma-separated emails granted initial admin role | Empty; use deliberately. |
| `CORS_ORIGINS` | Browser deployment | CORS middleware | Comma-separated allowed browser origins | `http://localhost:5173` locally. Empty allows no cross-origin browser calls. |
| `CORS_ALLOWED_HEADERS` | No | CORS middleware | Request-header allowlist | Built-in content/auth/voice-context headers. |
| `DEPENDENCY_HEALTH_TIMEOUT_MS` | No | Readiness service | Per-dependency probe timeout | `1000`. |
| `SHUTDOWN_GRACE_PERIOD_MS` | No | API/worker shutdown | Drain deadline before force stop | `15000`. |
| `SHUTDOWN_HARD_TIMEOUT_MS` | No | API/worker shutdown | Overall cleanup deadline | `30000`; must exceed grace. |
| `LOG_FILES_ENABLED` | No | Winston logger | Enable local file transports | `false`; console only. |

### OpenAI and AI configuration

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI client | Text, embeddings, speech, and vision authentication | No default; secret. |
| `OPENAI_MODEL` | No | Model registry | Backward-compatible balanced generation model | Repository default `gpt-4o`; `OPENAI_BALANCED_MODEL` takes precedence. |
| `OPENAI_ECONOMY_MODEL` | No | Model registry | Economy generation route | `gpt-4o-mini`. |
| `OPENAI_BALANCED_MODEL` | No | Model registry | Balanced generation route | Falls back to `OPENAI_MODEL`, then `gpt-4o`. |
| `OPENAI_ADVANCED_MODEL` | No | Model registry | Advanced reasoning route | Falls back to the balanced model. |
| `OPENAI_STRUCTURED_MODEL` | No | Model registry | Structured/tool-reliable route | Falls back to the balanced model. |
| `OPENAI_VISION_MODEL` | No | Model registry | Multimodal image route | Falls back to the balanced model. |
| `OPENAI_EVALUATION_MODEL` | No | Model registry | Evaluation/judge route | Falls back to the advanced model. |
| `OPENAI_EMBEDDING_MODEL` | No | Embeddings | Query/document embedding model | `text-embedding-3-small`; changing it requires compatible re-embedding. |
| `OPENAI_TRANSCRIPTION_MODEL` | No | Voice transcription | Speech-to-text model | `gpt-4o-mini-transcribe`. |
| `OPENAI_SPEECH_MODEL` | No | Voice synthesis | Text-to-speech model | `gpt-4o-mini-tts`. |
| `AI_REQUEST_TIMEOUT_MS` | No | OpenAI retry policy | Per-attempt request deadline | `30000`. |
| `AI_MAX_RETRIES` | No | OpenAI retry policy | Maximum transient retry count | `5`; accepted range is `0`-`5`. |
| `AI_RETRY_BASE_DELAY_MS` | No | OpenAI retry policy | Exponential backoff base delay | `250`. |
| `AI_RETRY_MAX_DELAY_MS` | No | OpenAI retry policy | Exponential backoff delay cap | `8000`. |
| `BIRD_IDENTIFICATION_JOB_STALL_TIMEOUT_MS` | No | Job status service | Mark durable queued/active jobs stale | `300000`. |
| `HEAD_LINE_BIRDS` | No | Homepage service | Comma-separated highlight names | Empty; alias below is supported. |
| `HOMEPAGE_BIRD_HIGHLIGHTS` | No | Homepage service | Legacy alias for highlight names | Used only when `HEAD_LINE_BIRDS` is empty. |

### Redis, rate limiting, queues, and caches

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `REDIS_URL` | Queue/readiness workflows | Redis/BullMQ | Connection URL | `redis://localhost:6379`. |
| `REDIS_CONNECT_TIMEOUT_MS` | No | Redis client | Connection deadline | `1000`. |
| `REDIS_KEY_PREFIX` | No | Caches/BullMQ fallback | Shared namespace | `birdwatching-ai:`. |
| `RATE_LIMIT_WINDOW_MS` | No | Global limiter | Window | `60000`. |
| `RATE_LIMIT_MAX_REQUESTS` | No | Global limiter | Requests per window | `60`. |
| `AI_RATE_LIMIT_WINDOW_MS` | No | Authenticated AI limiter | AI window | `60000`. |
| `AI_RATE_LIMIT_MAX_REQUESTS` | No | Authenticated AI limiter | AI requests per window | `12`; visitor limit is a fixed separate policy in code. |
| `RATE_LIMIT_REDIS_FAILURE_MODE` | No | Rate limiter | `local` fallback or `deny` | `local`; weaker across replicas during Redis failure. |
| `BULLMQ_KEY_PREFIX` | No | BullMQ | Queue namespace | `birdwatching-ai:jobs`, otherwise Redis prefix fallback. |
| `BULLMQ_JOB_ATTEMPTS` | No | BullMQ | Default attempts | `3`. |
| `BULLMQ_JOB_BACKOFF_DELAY_MS` | No | BullMQ | Exponential backoff base | `5000`. |
| `BULLMQ_WORKER_CONCURRENCY` | No | Worker | Jobs per worker instance | `2`. |
| `BULLMQ_DLQ_ENABLED` | No | Queue events | Copy terminal failures to DLQ | `true`. |
| `BULLMQ_DLQ_QUEUE_NAME` | No | Queue manager | DLQ name | `dead-letter`. |
| `BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS` | No | BullMQ | Completed retention age | `86400`. |
| `BULLMQ_REMOVE_ON_COMPLETE_COUNT` | No | BullMQ | Completed retention count | `1000`. |
| `BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS` | No | BullMQ | Failed retention age | `604800`. |
| `BULLMQ_REMOVE_ON_FAIL_COUNT` | No | BullMQ | Failed retention count | `5000`. |
| `REDIS_CACHE_TTL_SECONDS` | No | Generic cache | Default TTL | `300`. |
| `AI_RESPONSE_CACHE_TTL_SECONDS` | No | Exact response cache | Exact-answer TTL | `300`. |
| `RETRIEVAL_CACHE_TTL_SECONDS` | No | RAG cache | Retrieval TTL | `300`. |
| `SEMANTIC_CACHE_TTL_SECONDS` | No | Semantic response cache | Candidate TTL | `300`. |
| `SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | No | Semantic response cache | Cosine reuse threshold | `0.92`. |
| `SEMANTIC_CACHE_MAX_ENTRIES` | No | Semantic response cache | Prompt-version index bound | `100`. |
| `EMBEDDING_CACHE_TTL_SECONDS` | No | Embedding service | Embedding TTL | `86400`. |

### Observability, analytics, and evaluations

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `LANGCHAIN_TRACING` | No | Observability service | Enable LangSmith-compatible export | `false`; set literal `true` to enable. |
| `LANGCHAIN_PROJECT` | No | LangSmith | Project name | `birdwatching-ai`. |
| `LANGCHAIN_API_KEY` | When tracing enabled | LangSmith client | Trace authentication | Secret; no default. |
| `POSTHOG_ENABLED` | No | Analytics/feature flags | Enable server PostHog provider | `false`. |
| `POSTHOG_API_KEY` | When PostHog enabled | PostHog client | Project key | Secret/public classification depends on project use; store as server config. |
| `POSTHOG_HOST` | No | PostHog client | Ingest/API origin | `https://us.i.posthog.com`. |
| `AI_EVAL_RESULTS_FILE` | Real evaluation | Evaluation CLI | Actual-pipeline artifact input; also legacy dashboard path alias | No default input. |
| `AI_EVAL_DATASET_FILE` | No | Evaluation CLI | Golden dataset override | Checked-in golden dataset. |
| `AI_EVAL_BASELINE_FILE` | No | Evaluation CLI | Portfolio baseline override | Checked-in unavailable baseline. |
| `AI_EVAL_OUTPUT_FILE` | No | Evaluation/runtime config | Regression report path | `tmp/ai-eval-results.json`. |
| `AI_SCORER_SELF_TEST_DATASET_FILE` | No | Scorer self-test | Dataset override | Checked-in golden dataset. |
| `AI_SCORER_SELF_TEST_BASELINE_FILE` | No | Scorer self-test | Synthetic baseline override | Checked-in scorer baseline. |
| `AI_SCORER_SELF_TEST_OUTPUT_FILE` | No | Scorer self-test | Self-test report path | `tmp/ai-scorer-self-test-results.json`. |

### Stripe and billing

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `BILLING_PROVIDERS` | No | Provider registry | Enabled comma-separated providers | `stripe`; only Stripe is implemented. |
| `BILLING_DEFAULT_PROVIDER` | No | Billing services | Provider when request/path omits one | First enabled provider. |
| `STRIPE_SECRET_KEY` | Stripe workflow | Stripe adapter | Server API authentication | Test-mode secret locally. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Stripe adapter | Signature verification | Secret from test listener or deployment webhook. |
| `STRIPE_PRICE_PRO` | Stripe checkout fallback | Stripe adapter | PRO recurring price ID | Prefer durable provider mapping where configured. |
| `STRIPE_PRICE_GUIDE` | Stripe checkout fallback | Stripe adapter | GUIDE recurring price ID | Same note as PRO. |
| `STRIPE_CHECKOUT_SUCCESS_URL` | No | Stripe adapter | Hosted checkout success redirect | May derive from request origin. |
| `STRIPE_CHECKOUT_CANCEL_URL` | No | Stripe adapter | Hosted checkout cancel redirect | May derive from request origin. |
| `STRIPE_PORTAL_RETURN_URL` | No | Stripe adapter | Customer portal return URL | Defaults from request origin. |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS` | No | Signature verifier | Accepted timestamp age | `300`. |

### Media and external ingestion

| Variable | Required | Used by | Purpose | Safe local default or notes |
|---|---:|---|---|---|
| `CLOUDFRONT_BASE_URL` | Media delivery | `/files` and media services | Public CDN origin | Empty makes `/files` return configuration error. |
| `S3_REGION` | S3 workflows | Object storage | Bucket region | Required for voice/profile/identification/media uploads. |
| `S3_BUCKET_NAME` | S3 workflows | Object storage | Bucket name | Secret-store/deployment config. |
| `S3_ACCESS_KEY_ID` | S3 workflows | Object storage | Access key | Secret. |
| `S3_SECRET_ACCESS_KEY` | S3 workflows | Object storage | Secret key | Secret. |
| `E_BIRD_API_BASE_URL` | eBird refresh | Ingestion client | API origin | No default. |
| `E_BIRD_API_KEY` | eBird refresh | Ingestion client | API authentication | Secret. |
| `INATURALIST_API_BASE_URL` | iNaturalist refresh | Ingestion client | API origin | No default. |
| `XENO_CANTO_API_BASE_URL` | Xeno-canto refresh | Ingestion client | API origin | No default. |
| `XENO_CANTO_API_KEY` | Xeno-canto refresh | Ingestion client | API authentication | Secret. |
| `WIKI_API_BASE_URL` | Wiki refresh | Ingestion client | API origin | Optional; no verified executable default. |
| `EXTERNAL_API_RATE_LIMIT_WINDOW_MS` | No | Ingestion clients | Shared source window | `60000`. |
| `EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS` | No | Ingestion clients | Requests per window | `40`; startup rejects values above 40. |

No environment variable implements a monetary AI budget.

## 19. Repository structure

```text
src/
  ai/              Clients, prompts, guardrails, agent, planner, tools, audio, embeddings
  analytics/       PostHog-backed product analytics
  api/             Express app, routes, controllers, middleware, validators, SSE
  cache/           Redis clients and cache abstractions
  config/          Validated runtime configuration and media mapping
  db/              Pool, TLS, migrations, queries, repositories
  evaluations/     Datasets, scorers, runners, comparisons, dashboards
  ingestion/       External clients, normalized data, enrichment services
  jobs/            Job types, options, terminal-error helpers
  observability/   LangSmith-compatible trace service
  providers/       Provider registry and Stripe adapter
  queues/          BullMQ queues, events, manager, DLQ
  runtime/         Lifecycle readiness and bounded shutdown
  services/        Application/domain workflows
  storage/         S3 bucket adapter
  tracing/         AI and background trace composition
  workers/         Identification, ingestion, and embedding processors
scripts/           Runtime build verification, enrichment, AI evaluation CLIs
__tests__/         Deterministic unit, contract, query, queue, and evaluation tests
docs/              Testing, deployment, privacy, prompting, experiments, guidelines
railway.json       Shared artifact build and base Railway policy
```

### Durable schema evolution

Migrations `001`–`029` create and evolve conversations/messages, conversation summaries, durable authenticated user memories and conflict history, structured reservation state/audit, Costa Rica geography/tours/birds/reservations, pgvector knowledge, users and roles, refresh tokens, usage logs, cart, identification/jobs, plans/subscriptions/provider mappings, profile media, billing events/dashboards, experiment assignments, AI feature economics/controls, and audited admin operations.

There is no automatic migration runner, rollback framework, or schema-version table in the application.

## 20. Deployment and operations

`npm run build` recreates `dist/` from an explicit runtime-directory allowlist, excludes evaluation code and raw ingestion data, and verifies required/forbidden artifact paths. The same artifact supports:

```bash
npm run start:api
npm run start:worker
```

For Railway, create separate services from the same build:

- API service start command: `npm run start:api`
- Worker service start command: `npm run start:worker`

The checked-in `railway.json` defines the build, one replica, and restart-on-failure policy but no deploy start command; configure each service explicitly. Share compatible `DATABASE_URL`, `REDIS_URL`, queue prefix, OpenAI, and optional provider variables.

Health behavior:

- `/health` and `/health/live` report process liveness without dependency calls.
- `/health/ready` checks PostgreSQL and Redis/queue connectivity in parallel with a timeout and returns 503 while degraded or shutting down.
- The worker has no HTTP endpoint; use process supervision plus queue/admin telemetry.

Deployment checklist:

1. Install and build with Node 22.
2. Apply migrations `001`–`029` in order before starting the new artifact.
3. Configure verified PostgreSQL TLS and Redis connectivity.
4. Start API and worker separately.
5. Point liveness/readiness probes at the documented API endpoints.
6. Verify deterministic tests/builds and provider-specific smoke paths actually enabled; repair and then re-enable the cross-repository SSE contract as a required passing check.
7. For Stripe, forward/receive signed webhooks; a browser success redirect alone does not grant entitlement.
8. For grounded chat, ingest a compatible corpus after vector migration.

The repository configures a single Railway replica and makes no autoscaling, multi-region, backup, recovery-time, or availability guarantee.

## 21. Architectural tradeoffs, limitations, and future improvements

Current tradeoffs:

- A modular monolith keeps domain transactions and AI orchestration close, but API and worker share deployment artifacts and release cadence.
- PostgreSQL functions centralize transactional invariants, but migrations are manual and require disciplined ordering.
- Deterministic planning constrains tool behavior and improves testability, but handles a narrower intent space than model-driven arbitrary planning.
- Retrieval fails open to preserve chat availability, but answers may be less grounded; consumers must inspect metadata rather than assume RAG ran.
- Redis caches reduce repeat provider/database work when available, but semantic reuse introduces freshness and similarity-threshold risk.
- BullMQ separates long image/ingestion work from HTTP, but adds Redis operations and a manually configured worker service.
- Synchronous voice reuses the chat stack simply, but holds one request across STT, agent, TTS, and upload.
- Optional telemetry avoids making providers availability dependencies, but gaps can remain invisible without operational alerting.

Evidence-based limitations:

- No verified real-pipeline AI quality baseline, calibration metric, latency distribution, load result, cost saving, or production traffic evidence.
- Tests mostly use mocked infrastructure; live integration and migration tests are operational responsibilities.
- Ingestion authorization is broader than admin-only.
- Conversation/media retention is not automatically enforced.
- Monetary spend budgets and automated cost circuit breakers are absent.
- Worker health is indirect; operational errors have a partial in-memory component.
- Stripe is the only implemented billing adapter despite provider-neutral domain types.

Plausible future directions, not current behavior:

- Add a migration runner with advisory locking, version records, preflight checks, and documented rollback/forward-fix policy.
- Add containerized live PostgreSQL/pgvector and Redis integration tests plus provider contract sandboxes.
- Capture and review a sanitized real-pipeline evaluation artifact, then establish versioned model/prompt/index baselines.
- Introduce queue-backed webhook processing and reconciliation for stronger billing recovery semantics.
- Add durable worker heartbeats, centralized operational error storage, and alert thresholds.
- Add per-plan monetary budgets or model-routing circuit breakers driven by authoritative usage/cost records.
- Partition/index or introduce a dedicated retrieval service only after measured corpus/query growth justifies the operational cost.
