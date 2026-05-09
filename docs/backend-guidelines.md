# Backend Guidelines

Back to [Project Context](../CONTEXT.md). Pair this with [API Contracts](./api.md) before changing routes.

## Implementation Style
- Use explicit ESM imports and exports.
- Keep controllers thin: read request data, log request metadata, call a service, return `sendSuccess`.
- Keep business orchestration in `src/services/`.
- Keep SQL in `src/db/queries/`; never build SQL with untrusted string interpolation.
- Keep prompt text, prompt versions, and OpenAI schemas in `src/ai/`.

## Validation
- Validate external input at the middleware boundary with `validate(...)`.
- Return structured `HttpError` details for client-fixable payload issues.
- Normalize and trim payload fields in validators before services run.
- Preserve current constraints unless product requirements change:
  - chat message max: 4000 characters
  - conversation ID max: 128 characters
  - recommendation days: 1 to 30
  - recommendation budgets: `budget`, `moderate`, `luxury`

## Errors
- Use `HttpError` for expected request, validation, rate limit, and provider failures.
- Let `asyncHandler` forward promise failures to `error.middleware.js`.
- Do not expose stack traces to clients; the middleware hides server errors behind `INTERNAL_SERVER_ERROR`.
- Log enough metadata to debug without logging secrets or full tokens.

## OpenAI
- Always send role-based messages.
- Use centralized prompts from `src/ai/prompts/`.
- Keep structured recommendation output aligned with `src/ai/recommendation.schema.js`.
- Log model, request ID, token usage, prompt version, and response length where available.
- Retry only safe transient OpenAI failures through `asyncRetry`.

## Database
- Use `src/db/pool.js` for all PostgreSQL access.
- Store conversation metadata in `conversations` and chat exchanges in `messages`.
- Keep database helper functions in migrations when shared by query modules.
- Treat chat persistence as best-effort unless the API contract changes.
- Add migrations under `src/db/migrations/` for schema changes.

## RAG Data
- Keep runtime bird knowledge in `src/db/data/birds.json`.
- Preserve simple document fields used by embeddings: `name`, `locations` or `location`, and `description`.
- Treat embedded documents as an in-memory runtime cache; do not write generated embeddings into source files.

## Testing
- Unit test services, validators, query helpers, and AI orchestration boundaries.
- Integration test Express routes with Supertest.
- Mock OpenAI and PostgreSQL in tests; do not hit external services from the Jest suite.
