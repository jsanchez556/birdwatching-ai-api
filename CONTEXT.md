# Project Context

AI-agent entry point for the Birdwatching AI API. Read this file first, then follow links for deeper details.

## What This Is
This repository is a Node.js backend for Costa Rica birdwatching assistance, split into separate HTTP API and BullMQ worker entrypoints. It supports:
- conversational chat with short-term PostgreSQL memory
- PostgreSQL-backed RAG over ingested `src/ingestion/data` documents using pgvector
- reusable external bird data clients for eBird, iNaturalist, and Xeno-canto ingestion jobs
- media file lookup for relative bird media keys through CloudFront or `GET /files/:folderName/:filename`
- public homepage content for hero media, featured tours, bird highlights, and transportation add-ons
- authenticated bird identification through `POST /birds/identify`, accepting image URLs or validated image uploads before running rich visual evidence extraction, direct-image-aware candidate generation, bird-profile RAG verification/reranking, and final response assembly
- voice chat through `POST /voice-chat`, combining speech-to-text, chat orchestration, text-to-speech, S3 storage, and CloudFront-relative audio URLs
- OpenAI/agent tool calling for tour search, availability, transportation, pricing, discounts, and durable reservations
- Redis-backed caches for AI responses, semantic response reuse, RAG retrieval results, and embedding generation
- BullMQ-backed document ingestion, embedding, and bird-identification jobs with retry/backoff and dead-letter handling
- AI evaluation datasets, scorers, runners, prompt regression comparison, LangSmith-compatible evaluation reporting, and dashboard summaries
- normalized JSON responses and centralized error handling
- email/password authentication with bcrypt password hashes and JWT-protected AI routes
- authenticated display-name updates and S3-backed user profile image uploads
- provider-agnostic subscription billing with Stripe as the first hosted checkout, webhook, and billing management adapter for testing/development
- Railway-oriented deployment with environment-driven configuration for separate API and worker services

## Source Of Truth Map
- Human overview and setup: [README.md](./README.md)
- Agent rules and coding conventions: [AGENTS.md](./AGENTS.md)
- Architecture and flow diagrams: [docs/architecture.md](./docs/architecture.md)
- Endpoint contracts: [docs/api.md](./docs/api.md)
- Prompt assets and versioning: [docs/prompting.md](./docs/prompting.md)
- Conversation memory behavior: [docs/memory.md](./docs/memory.md)
- Deployment and environment: [docs/deployment.md](./docs/deployment.md)
- Privacy, retention, deletion, and export: [docs/privacy-retention.md](./docs/privacy-retention.md)
- Product analytics and event ownership: [docs/analytics.md](./docs/analytics.md)
- Product feature flags and rollout ownership: [docs/feature-flags.md](./docs/feature-flags.md)
- Product experiments and measurement ownership: [docs/experiments.md](./docs/experiments.md)
- AI feature economics and contribution margin: [docs/feature-economics.md](./docs/feature-economics.md)
- Backend implementation rules: [docs/backend-guidelines.md](./docs/backend-guidelines.md)
- Testing, AI evaluations, and CI gates: [docs/testing.md](./docs/testing.md)
- Model registry, routing policies, and admin preview: [docs/model-routing.md](./docs/model-routing.md)
- Optional capability fallbacks and response metadata: [docs/graceful-degradation.md](./docs/graceful-degradation.md)

## Current Architecture
The app uses a controller-service-query split:
- `src/api/server.js` starts the HTTP API process.
- `src/workers/index.js` starts the BullMQ worker process.
- `src/api/routes/*` binds HTTP paths to middleware and controllers.
- `src/api/controllers/*` extracts request data, logs request metadata, and returns response envelopes.
- `src/services/*` owns orchestration, AI calls, memory construction, and persistence decisions.
- `src/db/queries/*` owns parameterized calls to PostgreSQL functions through `src/db/pool.js`.
- `src/db/vector` owns pgvector storage, `src/ai/services` owns retrieval/chunking/embedding orchestration, and `src/ingestion` owns source exports and normalized bird data.
- `src/cache/` owns Redis client creation and cache abstractions used by AI response, retrieval, and embedding flows.
- `src/queues/` owns BullMQ queue registration, producers, and shared queue configuration used by the API and workers.
- `src/ingestion/` owns provider HTTP clients, export orchestration, normalized bird data, and ingestion source preparation.
- `src/api/routes/media.routes.js` owns CloudFront media URL creation for relative media keys; `src/storage/` remains for S3 uploads and object checks used by ingestion jobs.
- `src/ai/*` owns OpenAI client calls, prompt assets, structured schemas, chat tool adapters, and runtime AI telemetry.
- `src/evaluations/` owns offline AI evaluation datasets, scoring utilities, runners, prompt comparisons, LangSmith-compatible reporting, and dashboard summaries. Runtime token/cost and evaluator instrumentation lives under `src/ai/telemetry/`.
- `src/api/middleware/*` owns validation, sanitization, security headers, CORS protection, rate limiting, errors, and auth hooks.
- `src/utils/` owns shared helpers. Search existing utilities before adding a helper; prefer adding reusable helpers to an existing cohesive utility module, and use the `<name>.utils.js` naming convention for new utility files.

## Runtime Flows
Chat:
```text
POST /chat
  -> optionalAuth
  -> authenticated AI rate limit or visitor AI rate limit
  -> validateChatBody
  -> chat.controller.handleStreamChat
  -> chat.service.processMessageStream
  -> visitor role/topic authorization when no JWT is present
  -> conversation.service.assertCanAccess
  -> conversation.service.buildConversationContext
  -> rag.service.buildContext
  -> Redis retrieval cache lookup
  -> PostgreSQL pgvector retrieval
  -> frontend-safe sources and media-rich birdMatches metadata when matching bird profiles are retrieved
  -> agent orchestrator plans and executes required chat tools
  -> Redis exact/semantic response cache lookup
  -> OpenAI streams final assistant text through SSE chunk events with client-disconnect abort support
  -> Redis response cache write when safe
  -> conversation.service.saveExchange
  -> SSE start/chunk/replace/done/error events
```

Latest conversation lookup:
```text
GET /chat/latest
  -> requireAuth
  -> chat.controller.handleGetLatestConversation
  -> chat.service.getLatestConversation
  -> conversation.service.getLatestConversationForUser
  -> conversation.queries.getLatestByUserId
  -> conversation.queries.getByConversationId
```

## Important Implementation Facts
- ESM is enabled through `"type": "module"` in `package.json`.
- Express JSON payloads are limited to `64kb`.
- Security headers, CORS protection, and request sanitization are applied through `src/api/middleware/security.middleware.js`; CORS uses `CORS_ORIGINS`.
- Rate limiting is an in-memory per-IP bucket: 60 requests per minute.
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/logout` are public; login/signup issue access tokens plus DB-backed rotating refresh tokens, refresh rotates sessions, and logout revokes the supplied refresh token.
- `PATCH /auth/profile` and `POST /auth/profile-image` require JWT bearer auth and update only the current user. Profile image uploads accept raw JPEG, PNG, or WebP bytes up to 5 MB, store S3 objects under `user-profile-images/`, and return a safe `imageUrl`.
- `POST /billing/checkout`, `POST /billing/portal`, and `GET /billing/usage` require JWT bearer auth. Billing endpoints accept an optional provider name, default to `BILLING_DEFAULT_PROVIDER`, and return provider-neutral payment or management URLs. Provider customer/subscription IDs are resolved from the authenticated user's stored subscription and are never accepted from the client. Billing usage correlates LangSmith trace IDs, AI request cost, plan/subscription status, provider revenue, and profitability for the authenticated user's current month. `GET /billing/admin/dashboard` is admin-only and reports MRR, ARR, active/cancelled subscriptions, and revenue by paid plan. `POST /billing/admin/simulate-payment` is admin-only and records internal provider-neutral lifecycle events under provider `Other` for testing subscription flows without external provider calls.
- `POST /chat` accepts JWT-authenticated customer/admin users or unauthenticated visitor requests, while `GET /chat/latest` requires JWT bearer auth through `requireAuth`.
- `POST /birds/identify` requires JWT bearer auth. JSON URL requests preserve the existing `{ imageUrl }` flow; raw JPEG, PNG, WebP, or GIF uploads are capped at 10 MB, uploaded to S3 under `bird-identification/`, converted to a CloudFront URL, and passed into the same image-analysis pipeline. The multimodal bird identification pipeline now returns `status`, `bestMatch`, `candidates`, rich `imageAnalysis`, compatibility `imageObservations`, and conservative `notes`; confidence below `0.55` is `uncertain`, and below `0.40` is `unknown`.
- Visitor chat is limited to bird-related questions, cannot execute tour/reservation tools, and uses a stricter in-memory IP limit.
- `NODE_ENV=test` bypasses required `OPENAI_API_KEY`, `DATABASE_URL`, and `JWT_SECRET` validation.
- OpenAI retry behavior is centralized in `src/ai/utils/openaiRetry.utils.js` on
  top of `src/utils/async.utils.js`: classified transient failures use bounded
  exponential backoff with jitter and per-attempt deadlines, schema correction
  is limited to one retry, terminal provider/business/safety errors do not
  retry, and every scheduled retry emits safe telemetry.
- AI generation tasks use the centralized registry and deterministic policies
  under `src/ai/routing/`. The router returns a compatible primary/fallback
  chain without making provider calls; `POST /admin/model-routing/preview`
  exposes an authenticated, key-only operator projection.
- Final routed chat generation applies same-model retries before ordered
  cross-model fallback under one route deadline. A fallback can begin only
  before client output starts; every provider attempt keeps the same agent
  parent/correlation metadata and records sanitized attempt history.
- Every routed generation, including bird candidate generation and verification,
  produces one normalized model-routing execution record and correlation ID.
  LangSmith receives detached attempt-level diagnostics, PostHog receives one
  privacy-safe user-impact event, and the bounded process-local operational
  store supplies aggregate routing health through `/admin/overview`.
- Redis cache configuration is optional and environment-driven through `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_CACHE_TTL_SECONDS`, `AI_RESPONSE_CACHE_TTL_SECONDS`, `RETRIEVAL_CACHE_TTL_SECONDS`, `SEMANTIC_CACHE_TTL_SECONDS`, `SEMANTIC_CACHE_SIMILARITY_THRESHOLD`, `SEMANTIC_CACHE_MAX_ENTRIES`, and `EMBEDDING_CACHE_TTL_SECONDS`. Redis failures are logged and fall back to the normal OpenAI or pgvector path.
- Cache key hashing, positive numeric parsing/formatting, and whitespace normalization live in `src/utils/hash.utils.js`, `src/utils/number.utils.js`, and `src/utils/text.utils.js`; reuse those helpers for new cache-safe deterministic keys or metric formatting.
- Shared filesystem and media path helpers live in `src/utils/fs.utils.js` and `src/utils/file.utils.js`; use them instead of duplicating JSON file IO, freshness checks, or media URL/path normalization.
- Streaming chat passes an `AbortSignal` to OpenAI and skips saving a completed exchange when the client disconnects before completion.
- RAG reads only from PostgreSQL pgvector during chat. Use `npm run enrich -- birds` to refresh bird source data, generate `birds.json`, and ingest normalized bird documents before relying on bird RAG context; chat does not chunk documents, generate source embeddings, or write vectors.
- RAG retrieval can read/write Redis cache entries before hitting pgvector. PostgreSQL remains the source of truth, and failed cache operations do not fail chat.
- Bird RAG metadata may include `meta.birdMatches[].media` with absolute URLs or relative object keys such as `/photos/123_medium.jpg`, `songs/123.mp3`, or `sonograms/123_grey-small.png`. Relative keys are intentionally not public static paths; the UI resolves them through CloudFront when configured or through `GET /files/:folderName/:filename`, which returns a normalized envelope containing `data.url`.
- `GET /files/:folderName/:filename` normalizes and validates path segments, then returns a CloudFront URL from `CLOUDFRONT_BASE_URL`; it no longer creates S3 presigned URLs.
- External bird data clients live under `src/ingestion/clients/` and export orchestration lives in `src/ingestion/services/birdsIngest.service.js`. They are intended for ingestion jobs, not request handlers, and share a configurable rate limiter capped at 40 requests per minute.
- `npm run enrich -- birds` exports provider JSON into `src/ingestion/data`, applies per-resource freshness windows, regenerates `birds.json`, persists normalized documents, and queues BullMQ embedding jobs. The embedding worker chunks stored document content, generates embeddings, and writes pgvector chunks idempotently. eBird recent observations are fetched per species code from the Costa Rica species list and written incrementally as keyed `{ locations, lstDt }` summaries.
- `POST /ingestions` accepts authenticated normalized JSON documents or raw text uploads, persists the source payload, queues an ingestion job, and returns processing status. The ingestion worker loads the stored payload, runs the existing ingestion service, and queues embedding jobs; `GET /ingestions/:id` returns status metadata without source document contents.
- BullMQ AI jobs use configurable exponential backoff through `BULLMQ_JOB_ATTEMPTS` and `BULLMQ_JOB_BACKOFF_DELAY_MS`. Exhausted jobs are copied to a sanitized dead-letter queue when `BULLMQ_DLQ_ENABLED` is not `false`; DLQ payloads must not include raw documents, prompts, image URLs, provider responses, secrets, or PII. Malformed job payloads should use `src/jobs/jobErrors.js` so BullMQ does not retry non-retryable validation failures.
- Queue-health `completed` values count jobs still retained in the shared BullMQ Redis keyspace, not lifetime requests. Bird-identification enqueues explicitly attach the configured bounded `BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS` and `BULLMQ_REMOVE_ON_COMPLETE_COUNT` policy so recent successful jobs remain visible.
- BullMQ queue registration, enqueueing, worker execution, retry scheduling, failures, and DLQ handoff are traced through the LangSmith-compatible background job tracing adapter without exporting raw payloads or retryable provider error details.
- `GET /admin/errors` is an authenticated admin-only operational feed. It
  combines safe failed-job and payment-event projections from PostgreSQL,
  bounded sanitized BullMQ dead-letter records, and a bounded process-local
  telemetry ring for known LLM, tool, retrieval, invalid-output, and rate-limit
  failures. It returns only the seven documented normalized types, excludes
  unknown events, uses fixed safe messages, deduplicates matching job/DLQ
  records, and fails closed when a source is unavailable. LangSmith trace links
  come from the SDK and pass an HTTPS hostname allowlist; they are never
  constructed from trace IDs.
- `GET /admin/ai-quality` is an authenticated admin-only offline quality
  summary. It reads timestamped safe numeric results and allowlisted provenance from
  `AI_EVAL_OUTPUT_FILE` (or the compatible `AI_EVAL_RESULTS_FILE` fallback),
  compares UTC half-open current and immediately
  preceding equal-duration periods, and returns grounding, answer relevance,
  retrieval quality, and evaluated-tool success only for validated real-pipeline
  portfolio artifacts, with honest unavailable/null/sample-size semantics.
  Synthetic scorer self-tests are explicitly excluded. It does not execute
  evaluations or contact OpenAI/LangSmith.
- Tour data, availability, selection, and reservations are stored in PostgreSQL through functions in `003_create_tour_reservations.sql`; the tour helpers join the Costa Rica `country`/`zone`/`node`/`birds`/`birds_by_node` reference graph and return `location`, `node`, `subnode`, and `zone` for tour discovery, selection, and reservation metadata.
- Safe admin mutations use `POST /admin/jobs/:jobId/retry`,
  `POST /admin/users/:userId/suspend`, and
  `POST /admin/ai-features/:feature/disable`. They require current admin
  authorization, write an audit intent before attempting a side effect, and
  never store raw job payloads, user content, provider errors, or secrets in
  audit metadata. Migration `025_create_admin_operations.sql` owns
  `admin_audit_logs`, account suspension state, and expiring AI feature
  controls, including the feature-disable function's unambiguous named
  primary-key conflict target.
- Suspensions revoke active refresh tokens immediately. Production auth
  middleware also reads the current user access state so a previously issued
  access token cannot bypass a later suspension or role change.
- Tour listing, recommendation, guided action, pricing, transportation, and reservation details are returned in the `/chat` stream `done.meta` object for frontend rendering; recommendation-mode search results additionally expose the all-or-nothing Zod-validated `meta.tourRecommendation` card contract, while assistant text stays short.
- Tour selection accepts a tour ID or a clear/partial tour name such as `Monteverde tour` before pricing or reservation.
- `GET /chat/latest` loads the most recent conversation for `req.user.id` before the frontend creates a new conversation ID. If that conversation has a reservation, the response includes frontend-safe `meta.reservation` details plus chat-level booking state such as `meta.participants` and `meta.selectedTransportation`. Chat requests can include `customerContext` with name, email, and itinerary dates plus `conversationContext.recentAssistantMetadata` for continuing guided booking flows. For authenticated requests, the JWT user email is authoritative and the JWT user name is preferred when available.
- Reservation creation can include optional `customerEmail`, `discountCode`, itinerary dates, and selected transportation metadata; discounts are calculated in `reservation.service.js` and the tour total is computed inside the PostgreSQL function.
- `createReservation` is non-retryable at the agent tool executor. An ambiguous
  thrown failure returns an indeterminate result that requires reservation
  status verification; model fallback reuses completed tool context and never
  executes the reservation tool plan again.
- Database writes for chat memory are best-effort; save failures are logged but do not fail the chat response.
- Authenticated chat requests persist OpenAI prompt tokens, completion tokens, estimated cost, compact model usage, and LangSmith-compatible trace correlation to provider-neutral `usage_events`, plus the legacy `usage_logs` row on a best-effort basis after the streamed response completes.
- AI evaluation data lives under `src/evaluations/datasets/`. `golden-dataset.json` contains 100 representative bird identification, tour recommendation, reservation, RAG, and edge-case queries with expected behaviors and criteria. The portfolio gate requires captured real-pipeline outputs; synthetic label-derived scoring is isolated as a scorer self-test and is not quality evidence.
- The paired model-routing evaluation compares fixed single-model and routed-model executions over identical cases, counterbalances arm order, and reports task success, schema validity, latency, tokens, cost, fallback frequency, and reservation conversion. Its report command requires an attested real-pipeline artifact and never substitutes synthetic benchmark values.
- Evaluation scorers measure response relevance, grounding, correctness, completeness, retrieval chunk relevance, retrieval precision/recall, grounding quality, and tool correctness. Prompt regression runners compare prompt quality, latency, token usage, estimated cost, retrieval quality, and quality-per-dollar without storing raw prompt text.
- LangSmith-compatible evaluation helpers model the flow as `Run -> Evaluation -> Score -> Comparison`; dashboard helpers summarize quality trends, regression detection, and retrieval performance using safe numeric metadata.
- `.github/workflows/ai-evals.yml` runs the synthetic scorer self-test separately, requires a configured real-pipeline artifact for the portfolio gate, uploads both artifacts, and fails closed when real outputs are absent or thresholds are violated.
- AI response caching records `CACHE HIT` and `CACHE MISS` logs, tracks cache hit/miss metrics and estimated OpenAI savings, and skips response reuse when metadata contains user-specific, reservation, tool, or conversation-scoped state.
- Chat persistence uses the `conversations` and `messages` tables plus SQL helper functions from `src/db/migrations/002_create_functions.sql`; later migrations make those helpers owner-aware and merge safe JSONB booking metadata into `conversations.metadata`.
- Voice chat uses the same chat orchestration and conversation memory as `POST /chat`. `src/ai/audio/speechToText.adapter.js` and `src/ai/audio/textToSpeech.adapter.js` are internal services; standalone transcribe/speak routes are not exposed publicly.
- `POST /voice-chat` accepts raw MP3/WAV audio only, including `audio/mpeg`, `audio/mp3`, `audio/wav`, and `audio/x-wav`. Browser clients that record `audio/webm` should convert to WAV before upload or the backend validation will reject the request.
- Generated voice-chat MP3 responses are uploaded to S3 under `voice-chat/<uuid>.mp3`; the API returns a relative `/files/voice-chat/...` URL that clients resolve through CloudFront-backed media delivery.
- Voice chat creates one LangSmith-compatible parent trace with child spans for transcription, conversation context/RAG retrieval, agent execution/tool work, final chat response, and speech generation when tracing is enabled.
- Cache lookups and writes are traced as LangSmith-compatible cache/tool spans with hit, miss, skipped, avoided-LLM-call, hit-rate, and savings metadata when tracing is enabled.
- User authentication uses `users`, DB-backed refresh sessions use `refresh_tokens`, authenticated token/cost accounting uses `usage_logs`, and subscriptions use provider-neutral `user_subscriptions` plus optional `plan_provider_mappings`.
- Reservation persistence uses `tours` and `reservations` plus PostgreSQL functions from `003_create_tour_reservations.sql`; transaction, row locking, derived tour location metadata, and authenticated `user_id` persistence live in database functions after ownership migration. Chat-level booking metadata such as transportation selections is stored in `conversations.metadata`.

## Testing
Tests live in `__tests__/` and cover routes, services, and query helpers with ESM module mocks.

Run:
```bash
npm test
```

## When Extending
1. Add or update validators in `src/api/validators/`.
2. Controllers must only parse HTTP requests, validate and authorize input, and call services. Do not perform business logic, database access, or OpenAI prompt composition inside controllers.
3. Put orchestration in `src/services/`.
4. Put PostgreSQL functions and schema changes in `src/db/migrations/`; query modules should use parameterized calls to those functions for new persistence writes instead of inline write SQL.
5. Put prompt text and schemas in `src/ai/`.
6. Update the relevant docs link above when behavior changes.

## Authoritative safety controls

`GET /admin/ai-features` reports persisted state for `voice_ai`,
`multimodal_bird_identification`, and `agent_booking`.
`POST /admin/ai-features/:feature/enable` and
`POST /admin/users/:userId/unsuspend` reverse temporary shutdowns and
suspensions idempotently; every mutation is recorded in `admin_audit_logs`.
`GET /admin/users` exposes only safe suspension state.

`GET /features/availability` is the public state projection. Voice and bird
checks run before uploads, providers, or queues. A disabled booking feature
stops reservation tools and the final model call without disabling unrelated
chat; the chat response truthfully reports `reservation_tool` degradation and
never returns confirmation metadata. Voice and bird endpoint shutdowns use
`FEATURE_TEMPORARILY_DISABLED` and an ISO UTC `disabledUntil`, never provider
details.
