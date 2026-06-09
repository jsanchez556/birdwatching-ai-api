# Agent Guidance

Repository-specific instructions for AI coding assistants. Start with [CONTEXT.md](./CONTEXT.md).
Treat file paths as repository-relative strings matching `^(?:\.?/)?[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$`.
If the task text contains file paths, read only those exact paths from the repository root.
If the task text does not contain file paths, read only `./docs/architecture.md`, `./docs/api.md`, and `./docs/testing.md`.
If the task asks to modify files under `src/ai/prompts/` or `src/ai/schemas/`, also read `docs/prompting.md` in addition to the normal allowed file set.
Do not infer or expand paths, or read files outside the allowed set.
If a required named file is missing, unreadable, or resolves outside the repository root, stop and return a clear missing-file error instead of guessing.
The repository context file `CONTEXT.md` must always be read first.

## Purpose
This backend provides secure API delivery, OpenAI orchestration, PostgreSQL
conversation memory, structured birdwatching recommendations, and database-
backed tour reservation tools for Costa Rica.

## Stack
- Node.js with ESM
- Express 5
- PostgreSQL through `pg`
- OpenAI SDK
- Winston logging
- Jest and Supertest

## Architecture and file placement
1. Controllers parse HTTP requests, validate and authorize input, and call services. Do not perform business logic, database access, or OpenAI prompt composition inside controllers. If the provider output is syntactically valid but semantically inconsistent with the tool contract or business rules (for example, an unavailable tour, an invalid price, or a different tour than requested), treat it as `provider_malformed_response` and do not silently rewrite the result.
2. Use service/query separation for business logic and persistence.
3. Extract duplicated logic into a shared helper when the same behavior is used in 2 or more files or 2 or more functions, and the helper would remove repeated branching, validation, or response-shaping logic. Do not extract code that is only syntactically similar but implements different business behavior.
4. Keep prompt assets and OpenAI schemas in `src/ai/`, not in controllers.
5. Keep validators at the middleware boundary.
6. Normalize success and error responses through `src/utils/apiResponse.js`.
7. Use centralized `HttpError`, `asyncHandler`, and `src/middleware/error.middleware.js` for expected and unexpected failures.
8. Before creating a helper, search `src/utils/` for existing behavior. Reuse utilities when possible; add new shared helpers to an appropriate existing utility module before creating a new file. New utility files should use the `<name>.utils.js` naming convention.
9. Keep filesystem helpers in `src/utils/fs.utils.js` and file/media path helpers in `src/utils/file.utils.js`; do not duplicate JSON file IO, freshness checks, or URL/path normalization in feature modules.

## Security and logging
1. Reject malformed payloads before service execution.
2. Reject unknown fields unless explicitly allowed by the route validator. Return `422` with `{ error: 'validation_error', details: [...] }` and do not call services or AI orchestration.
3. Do not leak stack traces or provider internals to clients.
4. Production logs may include only low-cardinality request IDs, provider request IDs, aggregated token counts, and coarse-grained operational buckets.
5. Do not log secrets, prompt contents, response contents, PII, or high-cardinality identifiers such as API keys, database URLs, passwords, tokens, or full authorization headers.
6. Preserve the existing per-key and per-IP rate limits. If replacing a limiter, document that the new solution preserves or lowers requests per minute, burst capacity, and concurrency; supports distributed counters; exposes health-check endpoints; and falls back automatically if unavailable.
7. Use `optionalAuth` and `requireAuth` from `src/middleware/auth.middleware.js`.

## AI/provider behavior
1. Use role-based messages: `system`, `user`, `assistant`.
2. Use centralized prompts and prompt version metadata from `src/ai/prompts/`.
3. Keep chat tool schemas in `src/ai/schemas/`, execution/adapters in `src/ai/tools/`, and planning in `src/ai/orchestrators/`.
4. Do not put tool logic in controllers.
5. Keep tool schema names and handler names aligned exactly; `src/ai/tools/index.js` validates duplicate names and missing handlers at startup.
6. Do not log prompt contents, response contents, secrets, PII, or high-cardinality identifiers in production.
7. When updating prompts or tool schemas, update version metadata and `docs/prompting.md`; validate prompt/schema changes in staging when possible.
8. Add fallbacks or structured provider errors when OpenAI returns empty, partial, or malformed content; do not leak provider internals to clients.
9. If a requested tool name is not registered in `src/ai/tools/index.js`, return structured `400/422` with `{ error: 'tool_not_available' }`.
10. If the provider returns a syntactically valid response, validate it against the exact schema in `src/ai/schemas/<tool-name>.json`. If any required field is missing, has the wrong type, or violates declared constraints, return `{ error: 'provider_malformed_response', transient: false }`. When schema validation passes but business-rule validation fails (for example, an unavailable tour, invalid price, or wrong tour ID), return `{ error: 'provider_malformed_response', transient: false }` and do not retry; include only the provider request ID and error code in logs. Do not infer missing values or rewrite the response.
11. OpenAI retry policy:

- Precedence: When multiple rules match, use the first matching rule in the lists below.

- Terminal (do not retry):
   - `quota_error`: return `{ error: 'provider_quota_exhausted' }` immediately.
   - Other non-retryable client errors: fail immediately and surface a clear error.

- Retryable failures (use exponential backoff and jitter):
   - Transport failures (connection reset, DNS failure, TLS failure, or timeout): retry up to 5 times.
   - Retryable HTTP statuses (429, 500-599): retry up to 5 times.
   - Empty or schema-invalid provider responses: retry once.

When a response appears to match more than one category, follow the precedence rule above.

Persistence & Migrations
1. Use parameterized SQL in query modules.
2. Keep table definitions and SQL helper functions in migrations under `src/db/migrations/`.
3. For new persistence writes, create or update PostgreSQL functions in migrations and call those functions from query modules. Do not add inline `INSERT`, `UPDATE`, or `DELETE` statements in JavaScript query modules when a database function can own the write contract.
4. For multi-step persistence workflows and row-locking, implement logic inside PostgreSQL functions and call them from query modules.
5. Add migrations for schema changes.
6. Do not mix persistence logic into services beyond orchestration decisions.
7. When hashing identifiers for logs, store the project salt in a secure secrets store, rotate it quarterly, and document rotation procedures to avoid unverifiable historical hashes.
8. If migrations fail during startup, abort with exit code != 0, log a high-level error without credentials, and alert on-call.

Stop conditions: migrations applied successfully, startup hooks completed, no schema drift detected.

Ingestion & RAG
1. Runtime knowledge source files live under `src/ai/enrichment/data`.
2. Ingestion datasets are normalized JSON arrays; `birds.json` is the reference shape.
3. During ingestion, validate each document: if `externalId` or `name` is missing, reject the document and log an ingestion error; if `externalId` duplicates an existing record, skip or upsert based on a flag and emit a warning with counts.
4. Keep normalized document fields explicit enough for embedding text: required `externalId` and `name`, plus optional `description`, `locations`, `documentType`, `category`, `tags`, and `metadata`.
5. Store embedded vectors in PostgreSQL through pgvector; do not write generated embeddings into source files.
6. Run bird enrichment with `npm run enrich -- birds`; chat requests should only retrieve already-ingested knowledge.

Stop conditions: ingestion completes with validated counts and no critical validation errors.

Reservations & Tours
1. Runtime tour data and availability live in PostgreSQL; do not reintroduce JSON-backed tour state.
2. Reservation availability must use database-backed transactions and row locks inside PostgreSQL functions.
3. Tour discovery should search or recommend database-backed options before pricing or booking.
4. Tour listing/recommendation details and guided UI actions should be returned through `/chat` response metadata so the frontend can render controls without duplicating details in assistant text.
5. Tour selection may accept either an exact tour ID, or a tour name or location string that matches exactly one tour after trimming whitespace and converting to lowercase; do not use partial, prefix, or fuzzy matching.

Resolve by exact tour ID:

- Normalize the ID by trimming whitespace.
- If the ID matches exactly one tour, use that tour.
- If the ID matches no tour exactly, return `400` with `{ error: 'tour_not_found' }` and do not infer a different tour from the name/location input.

Resolve by name/location:

- Normalize the candidate string by trimming whitespace and converting to lowercase.
- If exactly one tour matches, use that tour.
- If zero tours match, return `400` with `{ error: 'tour_not_found' }`.
- If more than one tour matches, treat this as an ambiguity and follow the ambiguity-handling rules below.
6. Normalize candidate strings by trimming whitespace and converting to lowercase before comparison. Do not remove punctuation, accents, or abbreviations. Treat two tours as matching only when the normalized candidate string equals the normalized tour ID, name, or location using exact case-insensitive matching after trimming whitespace and lowercasing.

7. Ambiguity handling and interaction mode:

- A request is non-interactive only when either (a) the header `X-API-CLIENT: true` is present, or (b) the request path starts with `/api/`. Do not infer non-interactive mode from any other signal.
- In non-interactive cases return `400` with `{ error: 'tour_ambiguous', candidates: [...] }` instead of asking follow-up questions.
- In human-chat (interactive) channels, when multiple tours match, return a short numbered list of candidates with `id`, `name`, and `location`, and ask the user to choose one option. Do not continue with a booking attempt until the user selects exactly one candidate.

8. For name/location selection, perform case-insensitive exact matching first; if no exact match exists, do not guess.
9. If a booking transaction fails due to insufficient availability, return a structured conflict-style error with available inventory and suggested alternatives when possible.
10. Reservation tools may accept optional customer email, itinerary dates, selected transportation, and discount code. They must require `participant_count` and `customer_name`, and should resolve selected tours by ID or a name/location string that matches exactly one tour after normalization before creation.
11. Validate inputs before calling services: ensure `participant_count` is a positive integer, `customer_name` is non-empty, `itinerary_dates` is a valid date range, and `discount_code` is alphanumeric if present. Return `422` with `{ error: 'validation_error', details: [...] }` on any invalid input and do not call the reservation service.
12. If a reservation transaction fails with deadlock, serialization failure, or lock timeout, return `409` with `{ error: 'reservation_conflict' }` and do not retry automatically. If the database error code indicates connection failure, admin shutdown, or network disconnect (for example, connection refused or SQLSTATE `08006`), return `503` with `{ error: 'database_unavailable' }`.

Stop conditions: availability checks completed, reservation transaction committed or returned deterministic conflict/validation errors.

Provider Errors & Operational Rules
1. For runtime connection failures or transaction aborts that indicate the database is unavailable, return `503` with body `{ error: 'database_unavailable', message }` and increment a fatal incident metric; never leak stack traces.
2. In staging and development, mask or redact secrets and PII; use test provider keys. Real production provider keys must never be present in non-production logs.
3. If provider quota or account-level rate limits are detected across retries, mark the provider as degraded in health checks and failover to an alternate provider if configured; return `{ error: 'provider_quota_exhausted' }` to clients.
4. Tool results should be structured and safe for the model to summarize naturally.
5. Future tools should register schemas and handlers together so `src/ai/tools/index.js` can validate duplicate names and missing handlers at startup.

Stop conditions: provider health settled (ok/degraded), retry policy exhausted or failover configured.

## Testing expectations
- Unit test services, validators, query helpers, and prompt orchestration.
- Integration test routes with Supertest.
- Mock OpenAI and PostgreSQL in tests.
- Run `npm test` before handing off behavior changes.

## Recommended files for changes
- Routes: `src/routes/*`
- Controllers: `src/controllers/*`
- Services: `src/services/*`
- Queries and migrations: `src/db/*`
- Middleware: `src/middleware/*`
- Validators: `src/validators/*`
- AI prompts/schemas/client: `src/ai/*`
- Config: `src/config/env.js`
- Documentation: `CONTEXT.md`, `README.md`, `docs/*`
