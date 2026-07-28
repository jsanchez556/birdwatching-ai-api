# Birdwatching AI API

REST API for Costa Rica birdwatching chat, voice chat, trip recommendations, conversation memory, RAG retrieval, and tour reservations. The service is a single Node.js/Express app rooted at `src/` and integrates OpenAI with PostgreSQL persistence.

## Quick Links
- Project context for AI agents: [CONTEXT.md](./CONTEXT.md)
- Agent coding rules: [AGENTS.md](./AGENTS.md)
- Architecture details: [docs/architecture.md](./docs/architecture.md)
- API contracts: [docs/api.md](./docs/api.md)
- Prompting: [docs/prompting.md](./docs/prompting.md)
- Memory design: [docs/memory.md](./docs/memory.md)
- Deployment: [docs/deployment.md](./docs/deployment.md)
- Product analytics: [docs/analytics.md](./docs/analytics.md)

## Stack
- Node.js ESM, Express 5
- OpenAI SDK chat completions, embeddings, and agent tool orchestration
- PostgreSQL via `pg`
- Winston JSON logging
- Jest 30 with Supertest

## Local Setup
```bash
npm install
npm run dev
```

Required runtime variables are validated in `src/config/env.js`:
- `OPENAI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET`

Common optional variables:
- `PORT` defaults to `3000`
- `NODE_ENV` defaults to `development`
- `OPENAI_MODEL` defaults to `gpt-4o`
- `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`
- `REDIS_URL` defaults to `redis://localhost:6379`
- `REDIS_KEY_PREFIX` defaults to `birdwatching-ai:`
- `REDIS_CACHE_TTL_SECONDS`, `AI_RESPONSE_CACHE_TTL_SECONDS`, `RETRIEVAL_CACHE_TTL_SECONDS`, `SEMANTIC_CACHE_TTL_SECONDS`, and `EMBEDDING_CACHE_TTL_SECONDS` tune cache expiration
- `SEMANTIC_CACHE_SIMILARITY_THRESHOLD` defaults to `0.92`, and `SEMANTIC_CACHE_MAX_ENTRIES` defaults to `100`
- `CORS_ORIGINS` accepts a comma-separated allowlist
- `CORS_ALLOWED_HEADERS` accepts a comma-separated allowlist for request headers
- `LOG_FILES_ENABLED` accepts `true` or `false`
- `E_BIRD_API_BASE_URL` and `E_BIRD_API_KEY` enable eBird ingestion clients
- `INATURALIST_API_BASE_URL` enables iNaturalist taxa lookups
- `XENO_CANTO_API_BASE_URL` and `XENO_CANTO_API_KEY` enable Xeno-canto recording lookups
- `EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS` defaults to `40` and cannot exceed `40`
- `CLOUDFRONT_BASE_URL` enables public CDN media URLs for relative object keys
- `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` enable media asset uploads to the S3 bucket
- `BULLMQ_JOB_ATTEMPTS`, `BULLMQ_JOB_BACKOFF_DELAY_MS`, `BULLMQ_WORKER_CONCURRENCY`, and BullMQ cleanup variables tune background job retry and retention behavior
- `BILLING_PROVIDERS` and `BILLING_DEFAULT_PROVIDER` select enabled billing adapters; Stripe is currently the concrete adapter for hosted checkout and billing management in development/testing
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_GUIDE`, and `STRIPE_WEBHOOK_SECRET` configure the Stripe billing provider adapter
- `LANGCHAIN_TRACING`, `LANGCHAIN_PROJECT`, and `LANGCHAIN_API_KEY` enable sanitized LangSmith trace export
- `POSTHOG_ENABLED`, `POSTHOG_API_KEY`, and `POSTHOG_HOST` configure server-side product analytics

Run database migrations before using chat memory:
```bash
psql "$DATABASE_URL" -f src/db/migrations/001_create_chat_interactions.sql
psql "$DATABASE_URL" -f src/db/migrations/002_create_functions.sql
psql "$DATABASE_URL" -f src/db/migrations/003_create_tour_reservations.sql
psql "$DATABASE_URL" -f src/db/migrations/004_create_vector_knowledge.sql
psql "$DATABASE_URL" -f src/db/migrations/005_create_users.sql
psql "$DATABASE_URL" -f src/db/migrations/006_add_user_ownership.sql
psql "$DATABASE_URL" -f src/db/migrations/007_save_conversation_metadata.sql
psql "$DATABASE_URL" -f src/db/migrations/008_create_usage_logs.sql
psql "$DATABASE_URL" -f src/db/migrations/009_add_user_roles.sql
psql "$DATABASE_URL" -f src/db/migrations/010_create_refresh_tokens.sql
psql "$DATABASE_URL" -f src/db/migrations/011_tours_seed_data.sql
psql "$DATABASE_URL" -f src/db/migrations/012_accent_insensitive_tour_search.sql
psql "$DATABASE_URL" -f src/db/migrations/013_expand_homepage_tours_response.sql
psql "$DATABASE_URL" -f src/db/migrations/014_create_tour_cart.sql
psql "$DATABASE_URL" -f src/db/migrations/015_reservations_refactor.sql
psql "$DATABASE_URL" -f src/db/migrations/016_create_bird_identifications.sql
psql "$DATABASE_URL" -f src/db/migrations/017_create_jobs.sql
psql "$DATABASE_URL" -f src/db/migrations/018_create_subscription_plans.sql
psql "$DATABASE_URL" -f src/db/migrations/019_add_user_profile_image.sql
psql "$DATABASE_URL" -f src/db/migrations/020_create_billing_events.sql
psql "$DATABASE_URL" -f src/db/migrations/021_create_billing_dashboard.sql
psql "$DATABASE_URL" -f src/db/migrations/022_fix_subscription_sync.sql
psql "$DATABASE_URL" -f src/db/migrations/023_create_experiment_assignments.sql
psql "$DATABASE_URL" -f src/db/migrations/024_create_ai_feature_economics.sql
```

## Billing & Monetization
Billing plans, quotas, usage events, and subscription status are internal domain
concepts. Provider adapters translate hosted payment concepts into
`billing_provider`, `provider_customer_id`, `provider_subscription_id`, and
`provider_price_id` values on `user_subscriptions`. `plan_provider_mappings`
can map internal plans such as `PRO` and `GUIDE` to provider-specific product, price, SKU,
or equivalent identifiers when adding providers such as TiloPay.

- Subscription Plans: internal plans define the product tiers, entitlement
  names, and billing-provider mappings used when a user upgrades or changes
  their subscription. Subscription lifecycle statuses are `trialing`, `active`,
  `past_due`, `cancelled`, and `expired`.
- Usage Metering: authenticated AI requests persist provider-neutral usage
  events with token, cost, model, and trace metadata for downstream reporting.
- Billing Usage Dashboard: `GET /billing/usage` correlates LangSmith trace IDs,
  AI usage cost, plan/subscription status, provider revenue, gross profit, and
  margin for the authenticated user's current billing month.
- Admin Billing Dashboard: `GET /billing/admin/dashboard` is admin-only and
  reports monthly revenue, MRR, ARR, active/cancelled subscriptions, and revenue
  plus active subscription counts by paid plan.
- Billing Simulator: `POST /billing/admin/simulate-payment` is admin-only and
  records internal provider-neutral lifecycle events so development and QA can
  test renewals, cancellations, upgrades, downgrades, payment failures, and
  expirations without Stripe webhooks or external provider calls.
- Quota Enforcement: plan quotas should be checked before billable AI features
  run so over-limit users receive a controlled API response instead of
  incurring unbounded usage.
- Cost Governance: model usage, estimated cost, cache savings, and evaluation
  quality-per-dollar metrics give operators a way to manage AI spend without
  exposing provider internals to clients.
- Stripe Integration: Stripe is the first hosted checkout, webhook, and billing
  management adapter; it remains behind the provider abstraction so additional
  payment providers can be added without changing the public billing domain.
  Webhook deliveries are stored idempotently in `billing_events` by provider
  event ID before subscription side effects run.

## Bird Knowledge Base
Chat responses use a PostgreSQL-backed RAG flow with `pgvector`. Documents must
be ingested from `src/ingestion/data` before retrieval can return RAG context. The
ingestion command parses normalized JSON datasets, chunks each document, embeds
chunks with the OpenAI embeddings API, and persists documents, chunks, metadata,
and vectors in PostgreSQL.

Run enrichment after migrations and whenever bird source knowledge needs to be refreshed:
```bash
npm run enrich -- birds
```

The `birds` enrichment target refreshes stale external provider JSON, generates
`birds.json`, chunks and embeds the normalized bird documents, and persists the
result in PostgreSQL pgvector. The command is target-based so future datasets can
add their own pipeline behind the same command shape.

Supported source files are normalized `.json` arrays. `birds.json` is the
reference contract: each document requires stable `externalId` and `name`, and
may include `description`, `locations`, `documentType`, `category`, `tags`, and
structured `metadata`. Media URLs stay in metadata; generated embeddings are
stored only in PostgreSQL.

Reusable external API clients for future ingestion jobs live in
`src/ingestion/clients/`. eBird fetches Costa Rica species codes and recent
observations, iNaturalist searches taxa by name with one request, and
Xeno-canto fetches Costa Rica bird song recordings across all available pages by
default. `src/ingestion/services/birdsIngest.service.js` orchestrates provider exports, while
`src/utils/rateLimiter.js` keeps calls at or below 40 requests per minute.
Fetched provider data should be normalized before passing documents into the
existing vector ingestion service.

Media assets can be copied from provider URLs into an S3-compatible Railway
bucket through `src/services/mediaAsset.service.js`. The centralized media
service also reads editable entity-to-media mappings from
`src/config/mediaAssets.json`. The uploader builds deterministic object keys
from the provider, media type, and URL path, so re-running ingestion skips
objects that are already present before downloading.
Configure the S3 bucket by copying its region, bucket name, access key, and
secret key into local `.env` or Railway variables: `S3_REGION`,
`S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Keep those
values out of source control and logs.

When media-rich bird RAG uses relative keys such as `/photos/123_medium.jpg`,
`songs/123.mp3`, or `sonograms/123_grey-small.png`, those values are metadata
references, not public static paths. Browser clients should call
`GET /files/:folderName/:filename` to receive the normalized response envelope
with `data.url`, then render that URL. The endpoint requires
`CLOUDFRONT_BASE_URL` and returns public CDN URLs only. Absolute provider URLs
may still be returned and can be rendered directly by clients.

The bird enrichment pipeline writes external provider responses to
`src/ingestion/data` before generating `birds.json`. Run:
```bash
npm run enrich -- birds
```

The pipeline refreshes `ebird-species-list-cr.json` when missing or at least one
month old, `ebird-species-taxo-cr.json` when missing or at least six months old,
`ebird-recent-observations-cr.json` when missing or at least one week old,
`inaturalist-costa-rica-bird-images.json` when missing or at least one month old,
and `xenocanto-costa-rica-bird-songs.json` when missing or at least six months
old. It then validates those source files, regenerates `birds.json`, and ingests
that normalized dataset into the vector store. Taxonomy exports still fetch
missing species in chunks of 50 codes and preserve existing keyed records; recent
observations are written incrementally after each species.

Semantic retrieval runs through `src/ai/services/retrieval.service.js` and
`src/db/vector/vector.repository.js`, with optional metadata filters for fields
such as source, category, document type, locale, tags, and JSON metadata. If
PostgreSQL or `pgvector` is unavailable, chat continues without RAG context.
Chat requests do not run ingestion, generate embeddings for source documents, or
write vectors.

When Redis is available, RAG retrieval results are cached before repeating the
same pgvector search. Redis is an optimization only: PostgreSQL stays the source
of truth, and cache failures are logged before falling back to retrieval.

## AI Caching
`src/cache/` provides the Redis client and reusable cache service abstraction.
The AI layer uses it for exact response caching, semantic response reuse,
embedding caching, and RAG retrieval caching. Exact response cache keys use
stable hashed prompt metadata; semantic caching stores embeddings for cacheable
questions and reuses answers only above the configured similarity threshold.

Response caches skip user-sensitive, authenticated, reservation, tool, and
conversation-specific metadata. Cache hits and misses are logged as `CACHE HIT`
and `CACHE MISS`, and cache metrics expose hit rate plus estimated OpenAI
savings. Redis lookup/write failures do not block chat or embedding generation.

## Tour Tools
Chat can use agent-orchestrated tool calls for tour search and recommendations,
availability checks, transportation estimates, price calculations, discounts,
and durable reservation creation. Tool schemas live in `src/ai/schemas/`, tool
adapters live in `src/ai/tools/`, and the planning/execution layer coordinates
multi-step booking flows before final assistant text is streamed. Tour listing,
selection, and reservation state are stored in PostgreSQL through
`src/db/queries/tour.queries.js` and `src/db/queries/reservation.queries.js`.

Tour listing, recommendation, guided action, pricing, transportation, and
reservation results are returned through the `/chat` stream `done.meta` object
for frontend rendering, while assistant text stays short when structured
metadata is available. Explicit selection can use a tour ID or a clear/partial
tour name before pricing or reservation.

Reservations can reuse `customerContext` supplied by the frontend for customer
name, email, and itinerary dates. They can also include an optional discount
code and selected transportation metadata. The backend calculates group or
code-based discounts before calling the transactional PostgreSQL reservation
function.

## Voice Chat
`POST /voice-chat` accepts raw MP3/WAV audio, transcribes speech with the internal speech-to-text service, sends the transcript through the same chat orchestration used by `POST /chat`, converts the assistant answer to MP3 with the internal text-to-speech service, uploads the generated MP3 to S3, and returns:
```json
{
  "transcript": "Where can I see quetzals?",
  "answer": "Scan fruiting trees along Monteverde cloud forest edges.",
  "audioResponseUrl": "/files/voice-chat/audio-id.mp3"
}
```

Supported request content types are `audio/mpeg`, `audio/mp3`, `audio/wav`, and `audio/x-wav`; `X-Filename`, when present, must end in `.mp3` or `.wav`. Browser clients that record `audio/webm` should convert to WAV before upload. Optional headers can carry `X-Conversation-Id`, `X-Customer-Context`, `X-Conversation-Context`, `X-Role`, and `X-Response-Mode: field_assistant`. The field-assistant response mode keeps spoken answers concise, actionable, and capped at two sentences.

The returned `audioResponseUrl` is a relative `/files/voice-chat/...` media reference. Clients should resolve it through the CloudFront-backed `GET /files/:folderName/:filename` endpoint or their own configured CDN base. The internal speech-to-text and text-to-speech services are reusable from backend services, but standalone public transcribe/speak endpoints are not exposed.

When LangSmith tracing is enabled, voice chat creates one `voice_chat` parent trace with child spans for transcription, conversation context/RAG retrieval, agent execution/tool work, final chat response generation, and speech generation. Cache lookups and writes are also traced with hit, miss, skipped, avoided-LLM-call, hit-rate, and estimated-savings metadata.

## Scripts
```bash
npm start      # npm run start:api
npm run dev    # npm run dev:api
npm run dev:api
npm run dev:worker
npm run start:api
npm run start:worker
npm run enrich -- birds # refresh bird data, generate birds.json, and ingest pgvector documents
npm run ai:evals       # run offline AI evaluation gates against the baseline
npm test       # Jest ESM test runner
```

## Runtime Endpoints
- `GET /health`
- `GET /homepage/hero`
- `GET /tours`
- `GET /birds/highlights`
- `GET /birds/profile`
- `GET /addons/transportation`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /billing/checkout`
- `POST /billing/portal`
- `GET /billing/usage`
- `GET /billing/admin/dashboard`
- `POST /billing/admin/simulate-payment`
- `POST /billing/webhook`
- `POST /billing/webhook/:provider`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:itemId`
- `DELETE /cart/items/:itemId`
- `GET /cart/reservations`
- `POST /cart/reservations`
- `POST /chat`
- `POST /voice-chat`
- `GET /chat/latest`
- `GET /chat/:conversationId`
- `POST /birds/identify`
- `POST /bird-identification`
- `GET /jobs/:id`
- `POST /ingestions`
- `GET /ingestions/:id`
- `GET /files/:folderName/:filename`

Responses use the normalized envelope from `src/utils/apiResponse.js`.

## Persistence
PostgreSQL stores one `conversations` row per conversation ID and one
`messages` row per user/assistant exchange. Query modules call PostgreSQL
functions from migrations instead of embedding persistence SQL in JavaScript.
Authenticated conversations and reservations link to `users.id`, while
`refresh_tokens` stores hashed rotating refresh-token sessions and `usage_logs`
stores best-effort token/cost records for authenticated chat turns.

Tour reservations use PostgreSQL `tours` and `reservations` tables from
`003_create_tour_reservations.sql`, including database functions for tour lookup
and transactional reservation creation. Later migrations add accent-insensitive
tour search, expanded homepage tour fields, cart and reservation metadata,
bird-identification records, and BullMQ job records. `011_tours_seed_data.sql`
adds optional tour `node_id`, coordinates, and itinerary date columns, plus a
Costa Rica birding reference graph:
- `country` stores country records such as Costa Rica.
- `zone` stores ranked birding regions within a country.
- `node` stores ranked hierarchical birding areas and sub-sites within zones.
- `birds` stores target bird names, optional eBird/Clements `species_code`,
  tags, and active status.
- `birds_by_node` stores ranked bird associations for each node.

RAG persistence uses `knowledge_documents` and `knowledge_chunks` from
`004_create_vector_knowledge.sql`. The migration enables the `vector` extension
and creates indexes for semantic search and metadata filtering.

## AI Evaluations
Offline evaluation infrastructure lives under `src/evaluations/`:
- `datasets/golden-dataset.json` contains 100 representative birdwatching AI cases with questions, expected behaviors, criteria, and edge cases.
- `datasets/ai-eval-baseline.json` stores the checked-in quality and retrieval baseline.
- `scorers/` measures answer quality, relevance, grounding, correctness, completeness, retrieval precision/recall, and tool correctness.
- `runners/` executes dataset evaluation, prompt regression comparison, and LangSmith-compatible evaluation reporting.
- `dashboards/` prepares quality trend, regression detection, and retrieval performance summaries.

Run `npm run ai:evals` before changing prompt behavior or evaluation logic. The
GitHub Actions workflow `.github/workflows/ai-evals.yml` runs the same gate on
pull requests to `main` and fails when score or retrieval quality drops below
the baseline.
