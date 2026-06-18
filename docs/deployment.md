# Deployment

Back to [Project Context](../CONTEXT.md).

## Runtime
API start command:
```bash
npm run start:api
```

Worker start command:
```bash
npm run start:worker
```

API development command:
```bash
npm run dev:api
```

Worker development command:
```bash
npm run dev:worker
```

The API server listens on `0.0.0.0` and uses `PORT` from `src/config/env.js`.
The worker process does not expose an HTTP server; it registers BullMQ queues
and processors, then consumes background jobs.

## Environment Variables
Required outside tests:
- `OPENAI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET`

Optional:
- `PORT`, defaults to `3000`
- `NODE_ENV`, defaults to `development`; allowed values are `development`, `test`, `production`
- `OPENAI_MODEL`, defaults to `gpt-4o`
- `OPENAI_EMBEDDING_MODEL`, defaults to `text-embedding-3-small`
- `REDIS_URL`, defaults to `redis://localhost:6379`
- `REDIS_KEY_PREFIX`, defaults to `birdwatching-ai:`
- `BULLMQ_KEY_PREFIX`, defaults to `birdwatching-ai:jobs`
- `BULLMQ_JOB_ATTEMPTS`, defaults to `3`
- `BULLMQ_JOB_BACKOFF_DELAY_MS`, defaults to `5000`
- `BULLMQ_DLQ_ENABLED`, `true` or `false`; defaults to `true`
- `BULLMQ_DLQ_QUEUE_NAME`, defaults to `dead-letter`
- `BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS`, defaults to `86400`
- `BULLMQ_REMOVE_ON_COMPLETE_COUNT`, defaults to `1000`
- `BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS`, defaults to `604800`
- `BULLMQ_REMOVE_ON_FAIL_COUNT`, defaults to `5000`
- `BULLMQ_WORKER_CONCURRENCY`, defaults to `2`
- `REDIS_CACHE_TTL_SECONDS`, defaults to `300`
- `AI_RESPONSE_CACHE_TTL_SECONDS`, defaults to `300`
- `RETRIEVAL_CACHE_TTL_SECONDS`, defaults to `300`
- `SEMANTIC_CACHE_TTL_SECONDS`, defaults to `300`
- `SEMANTIC_CACHE_SIMILARITY_THRESHOLD`, defaults to `0.92`
- `SEMANTIC_CACHE_MAX_ENTRIES`, defaults to `100`
- `BILLING_PROVIDERS`, comma-separated enabled billing providers; defaults to `stripe`
- `BILLING_DEFAULT_PROVIDER`, billing provider used when the request body or webhook route does not name one; defaults to the first enabled provider
- `STRIPE_SECRET_KEY`: Stripe secret key used by the Stripe billing adapter to create Checkout Sessions
- `STRIPE_PRO_PRICE_ID`: Stripe recurring price ID mapped to the internal PRO plan for development/testing
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/billing/webhook` or `/billing/webhook/stripe`
- `STRIPE_CHECKOUT_SUCCESS_URL`: optional hosted Checkout success redirect URL
- `STRIPE_CHECKOUT_CANCEL_URL`: optional hosted Checkout cancellation redirect URL
- `STRIPE_PORTAL_RETURN_URL`: optional Stripe Customer Portal return URL; defaults to the request origin with `?billing=portal`
- `STRIPE_WEBHOOK_TOLERANCE_SECONDS`, defaults to `300`
- `EMBEDDING_CACHE_TTL_SECONDS`, defaults to `86400`
- `LANGCHAIN_API_KEY`, enables LangSmith trace export when set with `LANGCHAIN_TRACING=true`
- `LANGCHAIN_TRACING`, set to `true` to enable LangSmith-compatible tracing
- `LANGCHAIN_PROJECT`, defaults to `birdwatching-ai`
- `CORS_ORIGINS`, comma-separated allowed origins; empty means no CORS allow-origin header is set
- `CORS_ALLOWED_HEADERS`, comma-separated allowed request headers; defaults to `Content-Type, Authorization, X-Filename`
- `RATE_LIMIT_WINDOW_MS`, defaults to `60000`
- `RATE_LIMIT_MAX_REQUESTS`, defaults to `60`
- `AI_RATE_LIMIT_WINDOW_MS`, defaults to `60000`
- `AI_RATE_LIMIT_MAX_REQUESTS`, defaults to `12`
- `LOG_FILES_ENABLED`, `true` or `false`; defaults to console-only logging
- `JWT_EXPIRES_IN`, defaults to `7d`
- `REFRESH_TOKEN_EXPIRES_IN_DAYS`, defaults to `30`
- `ADMIN_EMAIL`, optional comma-separated admin bootstrap email list
- `E_BIRD_API_BASE_URL`, required when using eBird ingestion clients
- `E_BIRD_API_KEY`, required when using eBird ingestion clients
- `INATURALIST_API_BASE_URL`, required when using iNaturalist ingestion clients
- `XENO_CANTO_API_BASE_URL`, required when using Xeno-canto ingestion clients
- `XENO_CANTO_API_KEY`, required when using Xeno-canto ingestion clients
- `WIKI_API_BASE_URL`, optional wiki lookup base URL
- `EXTERNAL_API_RATE_LIMIT_WINDOW_MS`, defaults to `60000`
- `EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS`, defaults to `40` and cannot exceed `40`
- `HEAD_LINE_BIRDS` or `HOMEPAGE_BIRD_HIGHLIGHTS`, optional comma-separated homepage highlight bird names
- `BIRD_IDENTIFICATION_JOB_STALL_TIMEOUT_MS`, defaults to `300000`
- `CLOUDFRONT_BASE_URL`, required for `/files` media URL responses
- `S3_REGION`, required when using media asset uploads or voice-chat speech storage
- `S3_BUCKET_NAME`, required when using media asset uploads or voice-chat speech storage
- `S3_ACCESS_KEY_ID`, required when using media asset uploads or voice-chat speech storage
- `S3_SECRET_ACCESS_KEY`, required when using media asset uploads or voice-chat speech storage

Do not commit `.env` files. The local `.gitignore` excludes them.

## Billing Providers
Subscription plans, usage tracking, and quota enforcement are provider-neutral.
`user_subscriptions` stores `billing_provider`, provider customer/subscription
IDs, provider price IDs, and local status. `plan_provider_mappings` can map
internal plans to provider product IDs, prices, SKUs, or equivalent identifiers.

Stripe is currently the concrete provider adapter. Enable and configure the
Stripe Customer Portal in the Stripe Dashboard before using `POST
/billing/portal` with `provider: "stripe"`. To add TiloPay or another provider,
add a provider adapter under `src/providers/billing/`, register it in the
provider index, add provider-specific environment variables, and translate
provider callbacks into the normalized subscription sync shape.

## PostgreSQL
The app expects tables and SQL helper functions from:
```text
src/db/migrations/001_create_chat_interactions.sql
src/db/migrations/002_create_functions.sql
src/db/migrations/003_create_tour_reservations.sql
src/db/migrations/004_create_vector_knowledge.sql
src/db/migrations/005_create_users.sql
src/db/migrations/006_add_user_ownership.sql
src/db/migrations/007_save_conversation_metadata.sql
src/db/migrations/008_create_usage_logs.sql
src/db/migrations/009_add_user_roles.sql
src/db/migrations/010_create_refresh_tokens.sql
src/db/migrations/011_tours_seed_data.sql
src/db/migrations/012_accent_insensitive_tour_search.sql
src/db/migrations/013_expand_homepage_tours_response.sql
src/db/migrations/014_create_tour_cart.sql
src/db/migrations/015_reservations_refactor.sql
src/db/migrations/016_create_bird_identifications.sql
src/db/migrations/017_create_jobs.sql
src/db/migrations/018_create_subscription_plans.sql
src/db/migrations/019_add_user_profile_image.sql
```

Run migrations in order with `psql`, Railway shell, or your deployment platform's database tooling before using chat memory, reservations, users, refresh-token sessions, usage logging, tour-location metadata, cart/reservation entry flows, bird-identification records, job polling, subscription plans, provider billing, profile images, or pgvector-backed RAG.

Production database connections use SSL with `rejectUnauthorized: false`.

## Runtime Data
- Bird RAG source data lives under `src/ingestion/data`; run `npm run enrich -- birds` after vector migrations to refresh provider data, generate `birds.json`, and ingest it.
- External bird data clients for eBird, iNaturalist, wiki, and Xeno-canto live under `src/ingestion/clients/`. They are reusable building blocks for ingestion jobs and are rate-limited to no more than 40 requests per minute before data is normalized for the vector store.
- External provider JSON exports are written to `src/ingestion/data` by `npm run enrich -- birds`. The eBird taxonomy export is incremental from the refreshed species list, eBird recent observations are fetched per species code from that list and written incrementally as a keyed `{ locations, lstDt }` summary. The enrich pipeline refreshes the species list monthly, taxonomy and Xeno-canto songs every six months, recent observations weekly, and iNaturalist images monthly.
- RAG retrieval reads PostgreSQL `knowledge_documents` and `knowledge_chunks`; chat requests do not ingest files or write vectors.
- Redis caches AI responses, semantic response candidates, embedding results, and RAG retrieval results when reachable. Cache misses or Redis errors fall back to OpenAI or pgvector, and PostgreSQL remains the source of truth for RAG.
- Tour seed data begins in `003_create_tour_reservations.sql`; `011_tours_seed_data.sql` adds tour `node_id`, coordinates, start/end dates, and the `country`/`zone`/`node`/`birds`/`birds_by_node` reference tables for Costa Rica birding geography and target species.
- Tour reservation availability is durable PostgreSQL state and is updated transactionally by PostgreSQL functions.
- Voice-chat generated speech responses are stored as MP3 objects under the S3 `voice-chat/` prefix. `POST /voice-chat` returns a relative `/files/voice-chat/...` URL, and `GET /files/:folderName/:filename` turns that relative key into a CloudFront URL using `CLOUDFRONT_BASE_URL`.
- User profile images are stored as JPEG, PNG, or WebP objects under the S3 `user-profile-images/` prefix. Uploads are capped at 5 MB and the API persists only the object key.

## AI Observability
Centralized AI telemetry lives under `src/observability`, `src/tracing`, and `src/monitoring`.
Tracing is safe to leave disabled locally; the app still records internal latency,
token, and error telemetry without requiring LangSmith credentials. When LangSmith
credentials are present, the observability service creates and updates sanitized
LangSmith runs through the `langsmith` SDK.

Set the following variables to export traces to LangSmith:
```bash
LANGCHAIN_TRACING=true
LANGCHAIN_PROJECT=birdwatching-ai
LANGCHAIN_API_KEY=<langsmith-api-key>
```

Current AI trace boundaries:
- Root streamed chat AI execution flow, including response length, source count, prompt versions, reservations, and tool names
- Conversation context assembly, including prompt/memory message counts by role
- LLM chat completions for tool resolution and final streaming responses
- OpenAI embedding generation used by RAG retrieval
- RAG pipeline calls, including retrieval latency, retrieved chunk summaries, similarity scores, grounding context, and prompt construction metadata
- Cache operations for exact AI responses, semantic responses, embeddings, and RAG retrieval, including hit/miss/skipped status, avoided LLM calls, hit rate, and estimated savings when available
- Agent orchestration, including user request metadata, planning, tool sequence, prompt assembly, and final response generation
- Multi-tool execution flows, including planner output, ordered tool steps, failures, skipped steps, retry counts, and retry scheduling events
- Tour tool execution through the registry and agent executor
- Voice chat workflow spans for OpenAI audio transcription, conversation context/RAG retrieval, agent execution/tool work, final chat response generation, and OpenAI speech generation
- BullMQ background job spans for queue registration, job enqueueing, worker execution, retry scheduling, final failure, and dead-letter handoff

Verify traces by running a chat request with the variables above set, then checking
the `birdwatching-ai` project in LangSmith. Application logs also include
`ai_trace_started`, `ai_trace_completed`, `ai_trace_failed`, and `ai_token_usage`
events with redacted metadata.

AI error monitoring emits `AI error monitored` log entries with stable event names:
- `retrieval_failed` for failed RAG retrievals
- `tool_timeout` for timeout-class tool failures
- `tool_failed` for non-timeout tool failures
- `invalid_json_output` for malformed model tool-call arguments
- `invalid_output` for assistant output blocked by output guardrails
- `hallucination_event` for guardrail-detected unsupported or unsafe assistant output
- `evaluation_run`, `evaluation`, `evaluation_score`, and `evaluation_comparison` for offline evaluation reporting

AI evaluation reporting lives under `src/evaluations/`. Local runners compare
answer quality, grounding, retrieval quality, tool correctness, latency, token
usage, and estimated cost without exporting prompt text or raw model responses.
LangSmith-compatible reporting uses the safe hierarchy
`Run -> Evaluation -> Score -> Comparison`, and dashboard helpers summarize
quality trends, regression detection, and retrieval performance.

## CORS
`CORS_ORIGINS` is parsed as a comma-separated allowlist. If it includes `*`,
the app responds with `Access-Control-Allow-Origin: *`. If the incoming origin
matches an allowlisted origin, that origin is echoed. If the allowlist is
non-empty and the incoming origin does not match, the first configured origin is
sent. If the allowlist is empty, no allow-origin header is set.

`CORS_ALLOWED_HEADERS` is parsed as a comma-separated list and returned as
`Access-Control-Allow-Headers`. Browser voice chat requests need:
```text
Content-Type,Authorization,Accept,X-Filename,X-Conversation-Id,X-Role,X-Response-Mode,X-Customer-Context,X-Conversation-Context
```

## Railway
`railway.json` uses Nixpacks and runs from the repository root:
```bash
npm install && npm run build
npm run start:api
```

The current Railway config sets `build.buildCommand` to
`npm install && npm run build`, with `deploy.startCommand` set to
`npm run start:api`.

Create two Railway services from this repository when running background jobs:

- API service: use `npm run start:api`. This service owns Express, validates
  HTTP requests and auth, enqueues BullMQ jobs, and returns job IDs or normal
  API responses.
- Worker service: use `npm run start:worker`. This service owns BullMQ worker
  processors for ingestion, embeddings, bird identification, OpenAI work, image
  analysis, and result persistence.

Both services should receive the same application variables, including
`DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, and `LANGCHAIN_API_KEY` when
tracing is enabled. The worker service does not need `PORT` unless the platform
requires one for service configuration.

For Railway object storage, create or attach a bucket, then copy the region,
bucket name, access key ID, and secret access key into the variables above.
Store these values only in Railway variables and local `.env`; never commit
credentials or expose them in API responses.

## Docker And Vercel
No `Dockerfile`, `docker-compose.yml`, or `vercel.json` exists in the current tree. Add those only when there is an actual deployment target to support.

## Pre-Deploy Checks
```bash
npm test
npm run ai:evals
```

Also verify:
- required environment variables are present in the host
- `CORS_ORIGINS` matches the frontend origin
- OpenAI model access is available for `OPENAI_MODEL`
- OpenAI embedding model access is available for `OPENAI_EMBEDDING_MODEL`
- Redis is reachable from the host when cache optimization is expected; verify with `redis-cli` against `REDIS_URL`
- `JWT_SECRET` is set to a strong secret and not exposed to the frontend
- all database migrations have run
- `npm run enrich -- birds` has been run after bird RAG source file changes
- AI evaluation score and retrieval quality meet or exceed the checked-in baseline
