# Backend Guidelines

Back to [Project Context](../CONTEXT.md). Pair this with [API Contracts](./api.md) before changing routes.

## Implementation Style
- Use explicit ESM imports and exports.
- Controllers must only parse HTTP requests, validate and authorize input, log safe request metadata, call services, and return normalized responses. Do not perform business logic, database access, or OpenAI prompt composition inside controllers.
- Keep business orchestration in `src/services/`.
- Keep SQL in `src/db/queries/`; never build SQL with untrusted string interpolation.
- Keep prompt text, prompt versions, and OpenAI schemas in `src/ai/`.
- Search `src/utils/` before adding helper functions. Reuse existing utilities first, add reusable helpers to a cohesive existing utility module when practical, and name new utility files with the `<name>.utils.js` convention.
- Use `src/utils/fs.utils.js` for JSON file IO and freshness checks, and `src/utils/file.utils.js` for reusable file/media path helpers.

## Validation
- Validate external input at the middleware boundary with `validate(...)`.
- Return structured `HttpError` details for client-fixable payload issues.
- Normalize and trim payload fields in validators before services run.
- Preserve current constraints unless product requirements change:
  - chat message max: 4000 characters
  - conversation ID max: 128 characters

## Errors
- Use `HttpError` for expected request, validation, rate limit, and provider failures.
- Let `asyncHandler` from `src/utils/async.utils.js` forward promise failures to `error.middleware.js`.
- Do not expose stack traces to clients; the middleware hides server errors behind `INTERNAL_SERVER_ERROR`.
- Log enough metadata to debug without logging secrets or full tokens.

## OpenAI
- Always send role-based messages.
- Use centralized prompts from `src/ai/prompts/`.
- Keep token usage and cost-estimation helpers in `src/ai/evaluations/`.
- Keep AI safety, refusal, or policy checks in `src/ai/guardrails/`.
- Keep chat tool schemas in `src/ai/schemas/`, adapters in `src/ai/tools/`, and multi-step planning in `src/ai/orchestrators/`.
- Feed tool results into final response context before returning conversational text.
- Log model, request ID, token usage, prompt version, and response length where available.
- Retry only safe transient OpenAI failures through `asyncRetry` from `src/utils/async.utils.js`.

## Database
- Use `src/db/pool.js` for all PostgreSQL access.
- Store conversation metadata in `conversations` and chat exchanges in `messages`.
- Keep database helper functions in migrations and call them from query modules instead of hardcoding persistence SQL in JavaScript.
- For new database writes, prefer a PostgreSQL function created in `src/db/migrations/` and call it with parameterized `SELECT * FROM function_name(...)` from `src/db/queries/`; avoid inline `INSERT`, `UPDATE`, or `DELETE` statements in query modules unless the write is intentionally trivial and documented.
- Treat chat persistence as best-effort unless the API contract changes.
- Add migrations under `src/db/migrations/` for schema changes.
- Keep auth state in `users` and `refresh_tokens`; keep usage accounting in `usage_logs`.
- Keep durable booking state in `tours` and `reservations`; use `country`, `zone`, `node`, `birds`, and `birds_by_node` for structured Costa Rica birding geography and ranked target-species references.
- Keep pgvector RAG documents in `knowledge_documents` and `knowledge_chunks`; do not mix RAG embeddings into the tour/location reference tables.

## RAG Data
- Keep runtime knowledge source files under `src/ai/enrichment/data`.
- Use normalized JSON arrays for ingestion datasets; `birds.json` is the reference contract.
- Preserve normalized document fields used by embeddings and UI metadata: required `externalId` and `name`, plus optional `description`, `locations`, `documentType`, `category`, `tags`, and `metadata`.
- Store generated embeddings in PostgreSQL through `src/db/vector/vector.repository.js`; do not write generated embeddings into source files.
- Keep enrichment, chunking, and semantic retrieval in `src/ai/enrichment`.
- Keep metadata filters parameterized and limited to known document fields, tags, and JSONB containment.
- Run bird document enrichment and ingestion through `npm run enrich -- birds`; do not run source document ingestion from chat or request handlers.

## External Bird Data
- Keep provider clients in `src/ai/enrichment/clients/` and ingestion orchestration in services.
- Use `src/utils/httpClient.js` for provider requests so non-2xx responses, malformed JSON, and unexpected response shapes are normalized.
- Share `src/utils/rateLimiter.js` across provider clients for ingestion jobs; do not configure external provider traffic above 40 requests per minute.
- Read eBird, iNaturalist, and Xeno-canto base URLs and API keys from `src/config/env.js`; never hardcode provider secrets.
- Keep external provider JSON export and cache behavior in `src/ai/enrichment/services/birds.enrichment.service.js` or enrichment services, not in provider client classes.
- Normalize fetched provider data before writing documents into `src/ai/enrichment/data` or passing it to vector ingestion.

## Tour Tools
- Keep tour data and reservation state in PostgreSQL; do not reintroduce JSON-backed tour state.
- When using tour location metadata, prefer `tours.node_id` and the active `zone`/`node` hierarchy over ad hoc location strings when the schema provides a matching node.
- Keep schemas in `src/ai/schemas/tour.schema.js`, adapters in `src/ai/tools/*.tool.js`, and dispatch in `src/ai/tools/index.js`.
- Keep tour listing, recommendation, and selection orchestration in `src/services/tour.service.js`.
- Keep reservation orchestration in `src/services/reservation.service.js`; `src/db/queries/reservation.queries.js` should call PostgreSQL functions.
- Keep discount calculation in `reservation.service.js`; keep final reservation total calculation in the database function so persisted totals match availability updates.
- Require explicit tour selection before pricing or reservation creation in prompt/tool behavior.
- Keep tour listing, recommendation, guided action, pricing, transportation, and reservation details in `/chat` response metadata; assistant text should not duplicate structured UI when metadata already contains it.
- Preserve tour selection by ID and clear/partial tour name.
- Preserve frontend `customerContext`, optional `customerEmail`, itinerary dates, selected transportation, and `discountCode` handling when changing reservation tools.
- Add future tool groups by providing an array of OpenAI schemas plus a handler map keyed by `function.name`; the registry validates duplicates and missing handlers.
- Use row locks and transactions inside PostgreSQL functions for reservation availability updates.

## Testing
- Unit test services, validators, query helpers, and AI orchestration boundaries.
- Integration test Express routes with Supertest.
- Mock OpenAI and PostgreSQL in tests; do not hit external services from the Jest suite.
