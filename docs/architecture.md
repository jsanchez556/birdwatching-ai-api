# Architecture

Back to [Project Context](../CONTEXT.md).

## Shape
This is a Node.js backend with separate API and worker process entrypoints.
There is no active `apps/` monorepo layout in the current tree.

```text
src/
  api/
    app.js               Express app, CORS, JSON parsing, rate limit, routes, errors
    server.js            HTTP API process entrypoint
    controllers/         thin HTTP handlers
    middleware/          validation, rate limit, error handling, auth
    routes/              route modules
    streaming/           HTTP response streaming helpers
    validators/          request payload validators
  ai/                    OpenAI client/service, agents, orchestrators, prompts, evaluations, guardrails, schemas, chat tools
  cache/                 Redis client and reusable response/retrieval cache abstractions
  config/                environment parsing and validation
  db/                    pg pool, migrations, query modules
  events/                BullMQ queue and worker event wiring
  jobs/                  shared background job names and default job options
  queues/                BullMQ queue configuration and queue manager
  workers/               BullMQ worker process entrypoint, manager, and job processors
  ai/enrichment/         external provider clients, enrichment data, chunking, and vector enrichment
  services/              business orchestration
  utils/                 shared helpers; prefer <name>.utils.js for new utility modules
  observability/         LangSmith-compatible trace configuration and trace lifecycle service
  tracing/               reusable AI tracing wrappers for LLM, RAG, tools, and agents
  monitoring/            centralized AI telemetry for latency, token usage, and errors
```

## Layer Rules
- Routes compose middleware and controller methods.
- Controllers should not build prompts, call SQL, or own business branching.
- Services own application behavior and call AI or query modules.
- Query modules own SQL and should use parameterized queries.
- AI modules own prompt text, prompt versions, schemas, provider calls, retry, and token usage logging.
- Cache modules own Redis connection details and generic get/set behavior; callers decide cache eligibility and fallback behavior.
- Queue modules own BullMQ queue registration and enqueueing for async background jobs.
- Worker modules own BullMQ worker startup and processors; processors call services instead of embedding business logic in queue plumbing.
- The API process registers queues so it can enqueue jobs, but it does not import worker processors or start workers.
- Middleware owns cross-cutting request behavior before and after controllers.

## Request Lifecycle
```text
HTTP request
  -> CORS headers and OPTIONS handling
  -> express.json({ limit: '64kb' })
  -> in-memory IP rate limit
  -> route-specific validation
  -> async controller
  -> service orchestration
  -> OpenAI and/or PostgreSQL
  -> normalized success envelope
  -> centralized error envelope on failure
```

## Main Flows
Chat context is assembled from:
1. `CHAT_SYSTEM_PROMPT`
2. up to 10 recent exchanges from the same `conversation_id`
3. the current user message
4. optional retrieved context injected after the base system message

RAG uses:
1. `npm run enrich -- birds` to refresh bird provider data, generate `birds.json`, normalize documents, persist source text, and enqueue embedding jobs
2. `rag.service.js` to check Redis for an equivalent retrieval query and relevant retrieval options
3. `src/ai/enrichment/services/retrieval.service.js` to embed the user question and retrieve ranked chunks through `src/db/vector/vector.repository.js` on cache miss
4. `rag.service.js` to write successful retrieval results back to Redis using the configured retrieval TTL
5. `rag.service.js` to inject a compact system context message and return frontend-safe `sources`
6. `rag.service.js` to derive compact `birdMatches` metadata from top `bird_profile` documents, including optional media references stored in document metadata

Bird identification uses:
1. authenticated `POST /birds/identify` requests with either a JSON `imageUrl` or raw JPEG, PNG, WebP, or GIF bytes
2. `imageUpload.middleware.js` plus `birdIdentification.validator.js` to enforce content type, size, and one-input-only rules
3. `birdIdentificationImageStorage.service.js` to upload raw images to S3 under `bird-identification/` and produce a CloudFront URL for provider image analysis
4. `birdImageAnalysis.service.js` to extract rich visible field marks, image quality, apparent group, bill details, plumage areas, and conservative confidence from the image
5. `birdIdentification.agent.js` to generate conservative candidate species from the rich evidence and, when available, the provider-readable image URL
6. `birdIdentification.service.js` to retrieve bird-profile RAG for candidates and confusion species, run verification/reranking against retrieved profiles, calibrate confidence thresholds, and assemble the final normalized response

External bird data ingestion uses:
1. provider-specific clients in `src/ai/enrichment/clients/` for eBird, iNaturalist, and Xeno-canto
2. `src/utils/httpClient.js` for shared GET request construction, JSON parsing, non-2xx errors, and response-shape validation
3. `src/utils/rateLimiter.js` for a shared async limiter capped at 40 requests per minute
4. focused export services in `src/ai/enrichment/services/` to orchestrate provider calls without coupling the clients to routes or controllers
5. reusable bird normalization helpers in `src/ai/enrichment/utils/birds.utils.js`, imported from their defining module instead of re-exported through services
6. `src/ai/enrichment/services/birds.enrichment.service.js` plus `src/ai/enrichment/scripts/enrich.js` to export provider JSON under `src/ai/enrichment/data` from `npm run enrich -- birds`

Shared utility modules should be checked before adding new helper code. JSON file
IO and freshness checks live in `src/utils/fs.utils.js`; reusable file and media
path helpers live in `src/utils/file.utils.js`.

The current external provider methods are `getSpeciesList`, `getRecentObservations`,
`searchTaxaByName`, and `getCostaRicaBirdSongs`. They read base URLs and API
keys from environment variables, fail fast when required configuration is
missing, and are intended to feed future ingestion workflows before documents
are normalized and persisted through the existing vector ingestion path.
`getRecentObservations` fetches recent Costa Rica observations for one eBird
species code at a time.
`getCostaRicaBirdSongs` follows Xeno-canto pagination by default and combines
recordings into one provider-shaped response; pass `{ paginate: false }` when a
caller needs only one page.

`npm run enrich -- birds` runs the bird enrichment target end to end. It refreshes
`ebird-species-list-cr.json` when missing or at least one month old,
`ebird-species-taxo-cr.json` when missing or at least six months old,
`ebird-recent-observations-cr.json` when missing or at least one week old,
`inaturalist-costa-rica-bird-images.json` when missing or at least one month old,
and `xenocanto-costa-rica-bird-songs.json` when missing or at least six months
old. It then validates those source files, regenerates `birds.json`, persists
the normalized documents, and queues BullMQ embedding jobs. The
`embeddingWorker` loads persisted document content, chunks it, generates
embeddings, and replaces pgvector chunks idempotently. Taxonomy remains
incremental by species code, and recent observations are written incrementally
after each species.

Media routing uses:
1. `src/api/routes/media.routes.js` to validate `GET /files/:folderName/:filename`
2. `CLOUDFRONT_BASE_URL` to return public CDN URLs
3. the normalized response envelope so UI clients receive `data.url` plus delivery metadata

Relative bird media keys in RAG metadata are references into this media route.
They are not static files served by the frontend. Absolute provider URLs may
still pass through RAG metadata unchanged.

Chat streaming uses:
1. `agent.orchestrator.js` to classify the turn, plan booking/tool steps, and request the final assistant response
2. tool schemas from `src/ai/schemas/tour.schema.js`
3. registry validation and dispatch through `src/ai/tools/index.js`
4. `ToolExecutor` in `src/ai/tools/tool.executor.js` for retries, trace metadata, and frontend-safe `uiAction` metadata
5. thin tool adapters in `src/ai/tools/*.tool.js`
6. tour listing and recommendation in `src/services/tour.service.js`
7. reservation and availability orchestration in `src/services/reservation.service.js`
8. PostgreSQL function calls in `src/db/queries/tour.queries.js` and `src/db/queries/reservation.queries.js`
9. frontend-safe tool metadata collected on the SSE `done` event `meta` object
10. OpenAI streaming for the final assistant response
11. SSE `start`, `chunk`, optional `replace`, `done`, or `error` events

`POST /chat` is the single active chat response path. It enters
`chat.controller.handleStreamChat`, then `chat.service.processMessageStream`.
The controller creates an `AbortController` and aborts it if the SSE connection
closes before completion; the signal is passed through the chat service to the
OpenAI client so provider streaming stops cleanly. The chat service keeps a
short guardrail buffer before flushing chunks so sensitive output patterns can
be blocked before the final buffered text is sent. The completed assistant
response is saved to PostgreSQL on a best-effort basis after streaming finishes;
aborted streams are not saved as completed exchanges.

The current tour tool set is:
- `searchTours`
- `calculateTransportation`
- `checkAvailability`
- `calculatePricing`
- `createReservation`

Tour listing, recommendation, guided action, transportation, pricing, and
reservation results are returned through stream `done` event metadata, so
assistant text can stay short, such as `I found 2 tours that match your
preferences.` Recommendation ranking uses explicit filters plus the original
user query, so species terms such as `quetzal` can promote matching tour names
and locations. Explicit tour selection can be made by ID or clear/partial tour
name; service matching resolves names such as `Monteverde tour` to the
database-backed tour before selection validation.

When a selected tour is available but participant count is missing, tool
metadata includes a `participant_count` `uiAction` with numeric options from
`1` through the selected tour's available slots. A user reply from that action
can complete the reservation details and is persisted as `participants` in safe
response metadata for subsequent turns. If transportation preference is still
unknown, metadata includes a choice `uiAction` asking whether the customer wants
transportation before final reservation confirmation. `calculateTransportation`
can return a `transportation_selection` action; the selected option is stored as
`selectedTransportation`, and an explicit no is stored as
`transportationDeclined`. `createReservation` runs only after the booking
details are complete, transportation is either selected or declined, and the
user confirms through the final confirmation action or an affirmative reply to
that action.

Tour data, availability, and reservations are stored in PostgreSQL.
`createReservation` normalizes reservation arguments, reuses frontend-provided
customer context when available, calculates the best discount from supported
discount codes or group size, generates a confirmation code, and calls
`create_tour_reservation(...)`. The database function locks the tour row,
verifies available slots, updates availability, calculates the tour total, and
inserts the reservation in one database transaction. Transportation totals and
itinerary dates are returned in frontend-safe chat/tool metadata for the active
flow, but are not stored in a reservation metadata column.

Future tools should be added as a group with schemas and handlers keyed by the
OpenAI `function.name`. The registry rejects duplicate names and schemas without
matching handlers.

## AI Layer
The `src/ai/` layer is split by responsibility:
- `openai.client.js` and `openai.service.js` own provider calls, retry use, tool-call loops, chat response handling, embedding caching, exact response caching, semantic response caching, and cache metrics.
- `prompts/` owns versioned system prompts, RAG context formatting, and prompt message construction.
- `schemas/` owns OpenAI tool schemas.
- `tools/` owns thin tool adapters and registry validation for model-callable functions.
- `agents/` owns booking planner behavior and tool execution wiring.
- `orchestrators/` owns chat turn planning and coordinates tool execution before final response generation.
- `evaluations/` owns AI observability and evaluation helpers such as token usage and estimated cost accounting.
- `guardrails/` owns AI safety checks such as prompt-extraction blocking and sensitive-output fallbacks.

## Cache Layer
`src/cache/redisClient.js` reads Redis URL, key prefix, TTL, semantic threshold,
semantic index size, and embedding TTL configuration from the environment.
`src/cache/responseCache.js` provides JSON-safe `get`, `set`, `delete`, and
`disconnect` methods over Redis, and `src/cache/retrievalCache.js` specializes
that abstraction for retrieval entries.

AI response caching checks an exact hashed prompt key before OpenAI, then checks
semantic response candidates by embedding the latest user question and comparing
cosine similarity within the same prompt/role/response-mode scope. Cache writes
happen only after a successful provider response and only when metadata is safe
to reuse. RAG retrieval caching checks Redis before pgvector and writes retrieved
chunks after a successful retrieval. Embedding caching stores provider embedding
results under deterministic hashed keys for normalized single or array inputs.

Redis is best effort. Lookup or write failures are logged, then the request
continues through OpenAI or PostgreSQL. Cache helpers reuse shared utilities from
`src/utils/hash.utils.js`, `src/utils/number.utils.js`, and
`src/utils/text.utils.js` for deterministic keys, TTL/threshold parsing, metric
formatting, and normalized prompt hashing.

## Background Jobs
BullMQ infrastructure lives under `src/jobs`, `src/queues`, `src/workers`, and
`src/events`. `src/queues/bullmq.config.js` reads Redis and BullMQ settings from
environment variables, reusing `REDIS_URL` by default and allowing a separate
`BULLMQ_KEY_PREFIX`. Queue and worker managers accept injectable BullMQ classes
so tests can mock Redis boundaries.

The initial queue set is:
- `birdIdentificationQueue`
- `embeddingQueue`
- `ingestionQueue`
- `deadLetterQueue`

The initial worker set is:
- `birdIdentificationWorker`
- `embeddingWorker`
- `ingestionWorker`

Job names are centralized in `src/jobs/jobTypes.js`. New background workloads
should add a job type, queue mapping, queue registration module, worker
registration module, and focused manager tests. Processors should delegate to
existing service modules and keep queue retry, logging, and lifecycle behavior
inside the queue/worker layer.

AI background jobs share exponential retry options from
`src/queues/bullmq.config.js`. `BULLMQ_JOB_ATTEMPTS` controls the maximum
attempt count and `BULLMQ_JOB_BACKOFF_DELAY_MS` controls the base exponential
backoff delay. When a job exhausts its configured attempts, queue event handling
adds a sanitized record to the dead-letter queue, controlled by
`BULLMQ_DLQ_ENABLED` and `BULLMQ_DLQ_QUEUE_NAME`. DLQ payloads include stable
job identifiers, original queue/job names, attempts made, a safe error
message/code, and small allowlisted metadata only; they must not contain raw
documents, prompts, image URLs, provider responses, secrets, or PII. Worker
payload validation failures should throw `UnrecoverableError` through
`src/jobs/jobErrors.js` so malformed jobs are not retried like transient
provider, Redis, or PostgreSQL failures. Durable job records should be marked
failed only on the final retry attempt or on unrecoverable validation failure,
so polling clients do not see failed status while BullMQ still has retries
scheduled.

Background job lifecycle traces are emitted through
`src/tracing/backgroundJobTracing.js` into the same LangSmith-compatible
observability service used by chat, RAG, tools, and voice workflows. Queue
registration, job enqueueing, worker execution, retry scheduling, final
failures, and DLQ handoff are traced with queue/job identifiers, attempt counts,
worker names, and status metadata only. Worker execution traces sanitize
retryable error messages before exporting to LangSmith while still rethrowing
the original error to BullMQ.

Embedding jobs are enqueued by `src/services/embeddingJob.service.js` with a
small payload containing only the source `documentId`. The worker reloads the
document from PostgreSQL, chunks the stored source text, calls the existing
OpenAI embedding client, and writes through `vector.repository.replaceDocumentChunks`
so retries replace existing vectors instead of duplicating them.

Document ingestion jobs enter through `POST /ingestions`. The controller accepts
normalized JSON documents or raw text uploads, `documentIngestion.service.js`
persists the source payload in PostgreSQL, and BullMQ receives only the `jobId`.
The `ingestionWorker` loads the stored source payload, runs the existing
ingestion service, and lets that service queue embedding jobs. Polling through
`GET /ingestions/:id` returns lifecycle metadata without exposing document
contents.

## AI Observability
The observability layer is split into three small modules:
- `src/observability/observability.service.js` reads LangSmith/LangChain tracing configuration from environment variables, exposes trace lifecycle helpers, configures the standard `LANGCHAIN_*` process variables when available, and creates/updates sanitized LangSmith runs through the `langsmith` SDK.
- `src/tracing/aiTracing.middleware.js` provides wrappers for the end-to-end AI execution flow, conversation context assembly, LLM calls, RAG retrieval, RAG grounding, tool execution, and agent orchestration so instrumentation stays out of controllers and response formatting.
- `src/monitoring/aiTelemetry.js` records centralized latency, token usage, and error telemetry with prompt, response, customer, and secret fields redacted.

Chat currently emits a root AI execution trace for each streamed request, with child spans for conversation context assembly, OpenAI tool-resolution completions, final streaming completions, embedding generation, RAG retrieval, RAG/response cache operations, the RAG grounding pipeline, tour tool execution, and the birdwatching agent orchestration run. The root trace records response length, source count, prompt versions, reservation presence, and tool names; the conversation context span records message counts by role. Cache spans record hit, miss, skipped, write status, avoided LLM calls, cache hit rate, and estimated savings without logging raw prompts, embeddings, answers, or secrets. RAG pipeline telemetry includes retrieved chunk IDs, similarity scores, retrieval latency, grounding context size, and prompt-construction metadata; the final answer LLM trace also carries the compact grounding summary. Multi-tool agent telemetry follows the user request through planner output, ordered tool sequence, individual tool spans, failures, skipped steps, retry counts, retry scheduling events, prompt assembly, and the final response. AI error monitoring records stable log events for retrieval failures, tool timeouts, tool failures, malformed JSON tool-call arguments, invalid assistant outputs, and guardrail-detected hallucination events. Prompt evaluation tracking compares prompt versions by retrieval quality, token usage, and latency without storing prompt text. LangSmith evaluation tracking can submit `grounding_quality`, `answer_relevance`, and `tool_correctness` feedback for run IDs while keeping local numeric results available when export is disabled. LangSmith export is enabled when `LANGCHAIN_TRACING=true`, `LANGCHAIN_PROJECT` is set, and `LANGCHAIN_API_KEY` is present; otherwise the same code path continues to run with local telemetry only.

Voice chat creates a parent `voice_chat` AI execution trace and nests the
workflow spans under it: OpenAI audio transcription, conversation context,
RAG retrieval/grounding, birdwatching agent planning/tool execution/final
response, and OpenAI speech generation. This keeps the complete voice turn
visible as one LangSmith run tree without logging transcript text, assistant
text, prompts, secrets, or customer PII.

## Persistence
The `conversations` table stores one row per conversation:
- `conversation_id`
- optional `user_id`, `title`, and JSONB `metadata`
- `last_message_at`
- `created_at`

`conversations.user_id` is converted to `BIGINT` by the ownership migration and
references `users(id)` with `ON DELETE SET NULL`. `conversations.metadata`
defaults to `{}` and stores frontend-safe chat-level booking state such as
customer context, participant count, selected tour, transportation choice, and
reservation metadata.

The `messages` table stores one row per exchange:
- `conversation_id`
- `user_input`
- `ai_output`
- `created_at`

Query modules use SQL helper functions from `002_create_functions.sql`:
- `ensure_conversation`
- `save_message`
- `get_last_messages`
- `get_conversation_messages`
- `get_all_messages`
- `delete_message_by_id`

Later migrations replace several helper signatures: `ensure_conversation` and
`save_message` accept a `BIGINT` user ID, `save_message` accepts JSONB metadata,
and history readers can filter by owner. Recent context is returned in
chronological order by `get_last_messages` after limiting the newest exchanges.

The `users` table stores authentication state:
- `email` is unique and indexed
- `role` defaults to `customer` and is constrained to `admin`, `customer`, or `tour guide`
- `password_hash` stores bcrypt hashes
- `created_at` and `updated_at` use `TIMESTAMPTZ`; a trigger refreshes `updated_at`

The `refresh_tokens` table stores hashed rotating refresh-token sessions with
`expires_at`, optional `revoked_at`, and indexes for user lookup and active
token lookup. The `usage_logs` table stores authenticated OpenAI usage records:
`user_id`, non-negative prompt/completion token counts, optional estimated cost,
and `created_at`.

The `tours` and `reservations` tables store durable booking state:
- `tours.available_slots` is decremented transactionally
- `tours.node_id` can reference `node(id)` and tours may include latitude, longitude, `start_date`, and `end_date`
- `reservations.confirmation_code` is unique
- each reservation records optional `user_id`, `conversation_id`, `customer_name`, optional `customer_email`, `tour_id`, `participants`, `confirmation_code`, `created_at`, and `total_price`
- query modules call `get_tour_by_id(...)`, `get_available_tours(...)`, `select_tour(...)`, and `create_tour_reservation(...)` from `003_create_tour_reservations.sql`

The birding reference graph from `011_tours_refactor.sql` stores geographic and
species seed data:
- `country` has unique `acr` values such as `CR`.
- `zone` belongs to `country`, has `name`, required `des`, ranked ordering, and `is_active DEFAULT true`.
- `node` belongs to `zone`, can point to a parent `node`, has ranked ordering, optional coordinates and `des`, and `is_active DEFAULT true`; `(parent_id, zone_id, name)` and `(parent_id, zone_id, rank)` are unique.
- `birds` has unique `name`, optional unique `species_code`, optional text-array `tags`, and `is_active DEFAULT true`.
- `birds_by_node` joins nodes to birds with a per-node rank, `is_active DEFAULT true`, primary key `(node_id, bird_id)`, and unique `(node_id, rank)`.

The same migration seeds Costa Rica, six birding zones, hierarchical birding
nodes, target birds with tags/species codes when known, and ranked node-bird
associations. It drops and recreates the birding reference tables before
seeding, while preserving existing tour/reservation tables and adding tour
location metadata.

The RAG store is separate from the birding reference graph. `knowledge_documents`
stores one normalized source document per `external_id` with `tags`, JSONB
`metadata`, `content_hash`, and `active DEFAULT true`; `knowledge_chunks` stores
ordered content chunks, token counts, JSONB chunk metadata, and 1536-dimension
pgvector embeddings. Indexes cover document filters, GIN tags/metadata/text
search, chunk metadata/text search, and IVFFlat cosine embedding search.

## Cross-Cutting Concerns
- Errors are represented with `HttpError` and rendered by `error.middleware.js`.
- Response shape is centralized in `apiResponse.js`.
- Logging uses Winston and includes OpenAI request IDs and token usage when available.
- Database SSL is enabled only when `NODE_ENV=production`.
- `POST /chat` uses optional auth for customer/admin chat and visitor bird-only access; authenticated conversation ownership is enforced before history is loaded.
