# Architecture

Back to [Project Context](../CONTEXT.md).

## Shape
This is a single-service Node.js API. There is no active `apps/` monorepo layout in the current tree.

```text
src/
  app.js                 Express app, CORS, JSON parsing, rate limit, routes, errors
  server.js              process entrypoint
  ai/                    OpenAI client/service, agents, orchestrators, prompts, evaluations, guardrails, schemas, chat tools
  config/                environment parsing and validation
  controllers/           thin HTTP handlers
  db/                    pg pool, migrations, query modules
  external/              external provider HTTP clients and rate limiting
  middleware/            validation, rate limit, error handling, future auth
  routes/                route modules
  services/              business orchestration
  validators/            request payload validators
  utils/                 logger, retry, async handler, responses, errors
```

## Layer Rules
- Routes compose middleware and controller methods.
- Controllers should not build prompts, call SQL, or own business branching.
- Services own application behavior and call AI or query modules.
- Query modules own SQL and should use parameterized queries.
- AI modules own prompt text, prompt versions, schemas, provider calls, retry, and token usage logging.
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
1. `npm run ingest` to parse normalized JSON datasets from `src/db/ingestion/data`, chunk them, generate embeddings, and persist documents plus vectors in PostgreSQL
2. `src/db/retrieval/retrieval.service.js` to embed the user question and retrieve ranked chunks through `src/db/vector/vector.repository.js`
3. `rag.service.js` to inject a compact system context message and return frontend-safe `sources`
4. `rag.service.js` to derive compact `birdMatches` metadata from top `bird_profile` documents, including optional media references stored in document metadata

External bird data ingestion uses:
1. provider-specific clients in `src/external/clients/` for eBird, iNaturalist, and Xeno-canto
2. `src/external/httpClient.js` for shared GET request construction, JSON parsing, non-2xx errors, and response-shape validation
3. `src/external/rateLimiter.js` for a shared async limiter capped at 40 requests per minute
4. focused export services in `src/external/services/` to orchestrate provider calls without coupling the clients to routes or controllers
5. `src/external/export.service.js` plus `scripts/export-external-data.js` to export provider JSON under `src/external/data` from `npm run external`

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

`npm run external -- taxo` exports the eBird species list first, uses that list
to append missing taxonomy records into `ebird-species-taxo-cr.json` in chunks
of 50 species codes, then reads the same species list to refresh recent Costa
Rica observations one species at a time. Species lists are skipped when the file
is less than one year old. Taxonomy is incremental by species code, and recent
observations are written incrementally after each species. The observations file
is keyed by species code; each entry contains `locations` observation objects
sorted newest first plus `lstDt` for the most recent observation.
`npm run external -- sounds` fetches all Xeno-canto pages, maps recordings to
the simplified ingestion fields, writes one
`xenocanto-costa-rica-bird-songs.json` object keyed by English name, and skips
it for one year when fresh. `npm run external -- photos` reads
`ebird-species-taxo-cr.json`, de-duplicates species, searches
iNaturalist by common name, and writes
`inaturalist-costa-rica-bird-images.json` as a species-code keyed object with
image URLs and per-entry update dates. Each species lookup is skipped for one
year when its entry update date is fresh.
With no arguments, `npm run external` runs `taxo`, `sounds`, and `photos` in
that order.

Media routing uses:
1. `src/routes/media.routes.js` to validate `GET /files/:folderName/:filename`
2. `src/storage/s3Bucket.service.js` to check object existence and create a presigned GET URL
3. the normalized response envelope so UI clients receive `data.url` plus `meta.expiresInSeconds`

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
itinerary dates are added to frontend-safe metadata but do not replace the
database reservation record.

Future tools should be added as a group with schemas and handlers keyed by the
OpenAI `function.name`. The registry rejects duplicate names and schemas without
matching handlers.

## AI Layer
The `src/ai/` layer is split by responsibility:
- `openai.client.js` and `openai.service.js` own provider calls, retry use, tool-call loops, and chat response handling.
- `prompts/` owns versioned system prompts, RAG context formatting, and prompt message construction.
- `schemas/` owns OpenAI tool schemas.
- `tools/` owns thin tool adapters and registry validation for model-callable functions.
- `agents/` owns booking planner behavior and tool execution wiring.
- `orchestrators/` owns chat turn planning and coordinates tool execution before final response generation.
- `evaluations/` owns AI observability and evaluation helpers such as token usage and estimated cost accounting.
- `guardrails/` owns AI safety checks such as prompt-extraction blocking and sensitive-output fallbacks.

## Persistence
The `conversations` table stores one row per conversation:
- `conversation_id`
- optional `user_id`, `title`, and `metadata`
- `last_message_at`
- `created_at`

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

Recent context is returned in chronological order by `get_last_messages` after limiting the newest exchanges.

The `tours` and `reservations` tables store durable booking state:
- `tours.available_slots` is decremented transactionally
- `reservations.confirmation_code` is unique
- each reservation records `conversation_id`, `customer_name`, optional `customer_email`, `tour_id`, `participants`, `confirmation_code`, `created_at`, and `total_price`
- query modules call `get_tour_by_id(...)`, `get_available_tours(...)`, `select_tour(...)`, and `create_tour_reservation(...)` from `003_create_tour_reservations.sql`

## Cross-Cutting Concerns
- Errors are represented with `HttpError` and rendered by `error.middleware.js`.
- Response shape is centralized in `apiResponse.js`.
- Logging uses Winston and includes OpenAI request IDs and token usage when available.
- Database SSL is enabled only when `NODE_ENV=production`.
- `POST /chat` uses optional auth for customer/admin chat and visitor bird-only access; authenticated conversation ownership is enforced before history is loaded.
