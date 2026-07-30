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
- `OPENAI_MODEL`, backward-compatible balanced-generation alias; defaults to `gpt-4o`
- `OPENAI_ECONOMY_MODEL`, defaults to `gpt-4o-mini`
- `OPENAI_BALANCED_MODEL`, overrides `OPENAI_MODEL` for balanced routes
- `OPENAI_ADVANCED_MODEL`, defaults to the balanced model
- `OPENAI_STRUCTURED_MODEL`, defaults to the balanced model
- `OPENAI_VISION_MODEL`, defaults to the balanced model
- `OPENAI_EVALUATION_MODEL`, defaults to the advanced model
- `OPENAI_EMBEDDING_MODEL`, defaults to `text-embedding-3-small`
- `OPENAI_TRANSCRIPTION_MODEL`, defaults to `gpt-4o-mini-transcribe`
- `OPENAI_SPEECH_MODEL`, defaults to `gpt-4o-mini-tts`
- `AI_REQUEST_TIMEOUT_MS`, per-attempt OpenAI deadline; defaults to `30000`
- `AI_MAX_RETRIES`, maximum transient retries from `0` to `5`; defaults to `5`
- `AI_RETRY_BASE_DELAY_MS`, exponential backoff base; defaults to `250`
- `AI_RETRY_MAX_DELAY_MS`, exponential backoff cap; defaults to `8000`
- `REDIS_URL`, defaults to `redis://localhost:6379`
- `REDIS_CONNECT_TIMEOUT_MS`, defaults to `1000`
- `REDIS_KEY_PREFIX`, defaults to `birdwatching-ai:`
- `RATE_LIMIT_REDIS_FAILURE_MODE`, `local` (default) or `deny`; see Distributed rate limiting below
- `DEPENDENCY_HEALTH_TIMEOUT_MS`, defaults to `1000`
- `SHUTDOWN_GRACE_PERIOD_MS`, defaults to `15000`
- `SHUTDOWN_HARD_TIMEOUT_MS`, defaults to `30000` and must exceed the grace period
- `DATABASE_SSL_MODE`, `disable`, `require`, or `verify-full`; production defaults to `verify-full`
- `DATABASE_SSL_CA_BASE64`, optional base64-encoded private CA certificate
- `DATABASE_SSL_CA_FILE`, optional mounted CA path; mutually exclusive with `DATABASE_SSL_CA_BASE64`
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
- `STRIPE_PRICE_PRO`: Stripe recurring price ID mapped to the internal PRO plan for development/testing
- `STRIPE_PRICE_GUIDE`: Stripe recurring price ID mapped to the internal GUIDE plan for development/testing
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/billing/webhook` or `/billing/webhook/stripe`
- `STRIPE_CHECKOUT_SUCCESS_URL`: optional hosted Checkout success redirect URL
- `STRIPE_CHECKOUT_CANCEL_URL`: optional hosted Checkout cancellation redirect URL
- `STRIPE_PORTAL_RETURN_URL`: optional Stripe Customer Portal return URL; defaults to the request origin with `?billing=portal`
- `STRIPE_WEBHOOK_TOLERANCE_SECONDS`, defaults to `300`
- `POSTHOG_ENABLED`, `true` or `false`; defaults to `false`
- `POSTHOG_API_KEY`, PostHog project API key used only when analytics is enabled
- `POSTHOG_HOST`, PostHog ingest host; defaults to `https://us.i.posthog.com`

### OpenAI retry policy

OpenAI requests use bounded exponential backoff with 20% jitter and a
per-attempt deadline. Timeouts, ordinary `429` rate limits, transient network
failures, and transient `500`, `502`, `503`, or `504` responses retry.
Authentication, invalid requests,
quota/spend limits, business or tool validation failures, cancellations, and
safety refusals are terminal. Quota/spend failures emit an operational alert
event rather than being treated as ordinary rate limits.

Schema-invalid output may take one separately classified corrective retry.
Context-limit and tool-validation classifications return actions for the
calling orchestration to compact context or correct/request input; they do not
blindly repeat the same provider call. Every scheduled transient or corrective
retry emits `ai_retry_scheduled` telemetry with the safe operation, category,
attempt, retry ceiling, and delay.

For local Stripe test-mode checkout, forward signed subscription events before
opening Checkout:

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted \
  --forward-to localhost:3000/billing/webhook/stripe
```

Set `STRIPE_WEBHOOK_SECRET` to the signing secret printed by that listener and
restart the API. Keep the listener running through checkout completion. The
successful browser return is not an entitlement signal by itself; only the
verified webhook updates `user_subscriptions`.

- `EMBEDDING_CACHE_TTL_SECONDS`, defaults to `86400`
- `LANGCHAIN_API_KEY`, enables LangSmith trace export when set with `LANGCHAIN_TRACING=true`
- `LANGCHAIN_TRACING`, set to `true` to enable LangSmith-compatible tracing
- `LANGCHAIN_PROJECT`, defaults to `birdwatching-ai`
- `CORS_ORIGINS`, comma-separated allowed origins; empty means no CORS allow-origin header is set
- `CORS_ALLOWED_HEADERS`, comma-separated allowed request headers; defaults to `Content-Type, Authorization, X-Filename, X-Conversation-Id, X-Role, X-Response-Mode, X-Customer-Context, X-Conversation-Context`
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
src/db/migrations/020_create_billing_events.sql
src/db/migrations/021_create_billing_dashboard.sql
src/db/migrations/022_fix_subscription_sync.sql
src/db/migrations/023_create_experiment_assignments.sql
src/db/migrations/024_create_ai_feature_economics.sql
```

Run migrations in order with `psql`, Railway shell, or your deployment platform's database tooling before using chat memory, reservations, users, refresh-token sessions, usage logging, tour-location metadata, cart/reservation entry flows, bird-identification records, job polling, subscription plans, provider billing, profile images, or pgvector-backed RAG.

Production database connections default to `DATABASE_SSL_MODE=verify-full`,
which verifies the certificate chain and hostname using the Node trust store.
When a hosting provider supplies a private CA, mount it and set
`DATABASE_SSL_CA_FILE`, or provide it through the secret store as
`DATABASE_SSL_CA_BASE64`. Do not commit the certificate. `require` encrypts the
connection but does not authenticate the server and exists only as a migration
bridge for providers whose current connection endpoint cannot be verified.
Migrate from the former `rejectUnauthorized: false` behavior by testing
`verify-full` against the provider endpoint, adding the provider CA when
needed, and using `require` only for the shortest documented transition.
`disable` is intended for explicitly trusted local development only.

## Health probes

- `GET /health` and `GET /health/live` are liveness probes. They do not contact
  dependencies and should be used to decide whether the API process must be
  restarted.
- `GET /health/ready` is the API readiness probe. It checks only the API's
  required PostgreSQL and Redis/queue connectivity, in parallel, with
  `DEPENDENCY_HEALTH_TIMEOUT_MS` per check. Results are coalesced for one second
  to prevent probe load. It returns `200` only when both dependencies are
  available and `503` while degraded, timed out, or shutting down.

Configure the deployment platform to use `/health/live` for liveness and
`/health/ready` for readiness. Responses contain only stable status names,
process role, uptime for liveness, and `ok`/`unavailable` dependency states.
They never contain connection strings, hostnames, credentials, or raw errors.

The worker has no HTTP listener in the current two-service Railway topology.
Use the platform's process check plus the admin queue-health/DLQ view for worker
observation. During termination the worker stops consuming and waits for active
jobs before closing. If the platform later supports a private worker probe,
expose a heartbeat in the existing Redis keyspace with a short TTL rather than
adding a public worker port.

## Distributed rate limiting

API limits use a Redis fixed window beginning with the first request for a
hashed identity. A Lua script atomically increments the counter and applies
`PEXPIRE`; keys therefore disappear after one window and do not grow without
bound. Global requests use a hashed client IP; authenticated AI requests prefer
the user ID and visitors use a scoped IP. The current limits remain 60/minute
globally, 12/minute for authenticated AI, and 10/hour for visitor AI unless
configured lower or through the documented variables.

Responses include `RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`, and compatible `X-RateLimit-*` headers. Rejected requests
retain the existing safe `429` message and add `Retry-After`. Redis details are
never returned.

`RATE_LIMIT_REDIS_FAILURE_MODE=local` is the safe availability default: a Redis
failure falls back to a bounded 10,000-key per-replica fixed-window limiter.
This keeps customer traffic available but weakens cross-replica protection
until Redis recovers. Set `deny` to return a generic `503` when centralized
protection is mandatory; health readiness already becomes unavailable during
the same Redis outage.

## Graceful shutdown

SIGTERM and SIGINT handling is idempotent. The API marks readiness unavailable,
stops accepting connections, drains active HTTP requests, then closes BullMQ
queues/events, analytics, feature flags, Redis, and PostgreSQL. The worker stops
accepting jobs and waits for active work, then closes queues, Redis, and
PostgreSQL. `SHUTDOWN_GRACE_PERIOD_MS` forces active HTTP sockets/jobs closed;
`SHUTDOWN_HARD_TIMEOUT_MS` enforces an overall deadline. Clean shutdown returns
exit code `0`; resource failure or hard timeout returns `1`.

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

The admin operational error feed needs no additional tracing variable. When
the existing LangSmith configuration is complete, `GET /admin/errors` resolves
trace navigation through the SDK. Without it, error rows remain available and
return `traceUrl: null`.

The feed is deliberately not a single durable audit log. The admin UI labels it
as a partial, volatile, replica-local view. Failed `jobs` and
`billing_events.payment_failed` records survive restarts in PostgreSQL;
dead-letter records follow bounded BullMQ/Redis retention; AI, tool, retrieval,
invalid-output, rate-limit, checkout, and webhook records are held in a 250-entry ring in the
current API process. In a multi-replica deployment, an admin request sees only
that replica's in-memory records, and it does not see the worker process's
telemetry unless the failure is also represented by PostgreSQL or the
dead-letter queue.

This design avoids making best-effort telemetry a customer-request dependency.
Use PostgreSQL job/payment records, bounded BullMQ/DLQ data, platform logs, and
LangSmith as the cross-replica sources appropriate to each incident. A future
durable telemetry store should be introduced only with approved retention,
redaction, cleanup, and failure-isolation rules.

## Runtime artifact

`npm run build` composes a shared API/worker artifact from an explicit directory
allowlist and runs `npm run verify:artifact`. It includes API and worker entry
points, runtime prompts/schemas, SQL migrations, JSON configuration, and
runtime ingestion modules. It excludes `src/evaluations` and generated
`src/ingestion/data`; evaluations and bird enrichment remain CI/maintenance
processes run from the source checkout. The verification command fails when
required runtime assets are absent or excluded content reappears.

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

For end-to-end correlation, copy the response `X-AI-Trace-Id` value, locate the
LangSmith root run with that ID, and filter PostHog product events by the
matching `aiTraceId`. Only the opaque UUID is shared; trace payloads remain in
LangSmith.

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
`Access-Control-Allow-Headers`. The default covers the non-safelisted headers
used by browser voice chat requests:
```text
Content-Type,Authorization,X-Filename,X-Conversation-Id,X-Role,X-Response-Mode,X-Customer-Context,X-Conversation-Context
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

The API and worker must also use the same `BULLMQ_KEY_PREFIX` (or the same
`REDIS_KEY_PREFIX` fallback) and Redis database index. Queue-health counts are
read from that shared BullMQ keyspace. Completed jobs are retained for a bounded
age/count using the `BULLMQ_REMOVE_ON_COMPLETE_*` settings; the count is not a
durable or lifetime analytics total.

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
- OpenAI model access is available for every configured routing model
- OpenAI embedding model access is available for `OPENAI_EMBEDDING_MODEL`
- Redis is reachable from the host when cache optimization is expected; verify with `redis-cli` against `REDIS_URL`
- `JWT_SECRET` is set to a strong secret and not exposed to the frontend
- all database migrations have run
- `npm run enrich -- birds` has been run after bird RAG source file changes
- AI evaluation score and retrieval quality meet or exceed the checked-in baseline
