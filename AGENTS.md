# Agent Guidance

Repository-specific instructions for Codex, Copilot, Cursor, Claude Code, ChatGPT, and other AI coding assistants.

Start with [CONTEXT.md](./CONTEXT.md), then use the focused docs under `docs/`.

## Purpose
This backend provides secure API delivery, OpenAI orchestration, PostgreSQL conversation memory, and structured birdwatching recommendations for Costa Rica.

## Stack
- Node.js with ESM
- Express 5
- PostgreSQL through `pg`
- OpenAI SDK
- Winston logging
- Jest and Supertest

## Architecture Rules
- Keep controllers thin and request-focused.
- Use service/query separation for business logic and persistence.
- Keep prompt assets and OpenAI schemas in `src/ai/`, never in controllers.
- Keep validators at the middleware boundary.
- Normalize all success and error responses through `src/utils/apiResponse.js`.
- Use centralized `HttpError`, `asyncHandler`, and `error.middleware.js` for expected and unexpected failures.

## Security And Validation
- Reject malformed payloads before service execution.
- Do not leak stack traces or provider internals to clients.
- Do not log API keys, database URLs, passwords, tokens, or full secret-bearing headers.
- Preserve the global rate limit unless replacing it with a stronger shared-store limiter.
- `optionalAuth` is a placeholder; routes are public until real auth middleware is wired in.

## OpenAI Integration
- Use role-based messages: `system`, `user`, `assistant`.
- Use prompt versions from `src/ai/prompts/*`.
- Log OpenAI request IDs and token usage when available.
- Keep high-cardinality or sensitive metadata out of production logs.
- Add fallbacks or structured provider errors when OpenAI returns empty or malformed content.

## Database
- Use parameterized SQL in query modules.
- Add migrations for schema changes.
- Do not mix persistence logic into services beyond orchestration decisions.
- Preserve conversation isolation by always filtering chat history by `conversation_id`.

## Testing Expectations
- Unit test services, validators, query helpers, and prompt orchestration boundaries.
- Integration test routes with Supertest.
- Mock OpenAI and PostgreSQL in tests.
- Run `npm test` before handing off behavior changes.

## Recommended Files For Changes
- Routes: `src/routes/*`
- Controllers: `src/controllers/*`
- Services: `src/services/*`
- Queries and migrations: `src/db/*`
- Middleware: `src/middleware/*`
- Validators: `src/validators/*`
- AI prompts/schemas/client: `src/ai/*`
- Config: `src/config/env.js`
- Documentation: `CONTEXT.md`, `README.md`, `docs/*`
