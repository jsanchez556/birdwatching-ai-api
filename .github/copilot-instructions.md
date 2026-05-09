# Copilot Instructions

Use this file as repository-specific guidance for GitHub Copilot. For fuller context, read [CONTEXT.md](../CONTEXT.md), [AGENTS.md](../AGENTS.md), and the focused docs in [docs/](../docs/).

## Coding Conventions
- Use Node.js ESM syntax with explicit imports and exports.
- Prefer small, single-responsibility modules.
- Use `camelCase` for functions and variables.
- Use `PascalCase` for classes.
- Keep public data payloads explicit and predictable.
- Use concise JSDoc only when it clarifies object contracts or non-obvious behavior.
- Keep comments practical; explain intent, not obvious syntax.

## Architecture Rules
- This is a single Express API rooted at `src/`; do not assume an `apps/` monorepo layout.
- Routes live in `src/routes/` and compose middleware plus controllers.
- Controllers live in `src/controllers/` and should only extract request data, log request metadata, call services, and return normalized responses.
- Services live in `src/services/` and own business orchestration.
- SQL access lives in `src/db/queries/` and must use parameterized queries.
- SQL helper functions and table definitions live in ordered migrations under `src/db/migrations/`.
- OpenAI clients, prompts, prompt versions, and schemas live in `src/ai/`.
- Middleware owns validation, rate limiting, error handling, and authentication hooks.
- Environment parsing and validation belong in `src/config/env.js`.

## Preferred Patterns
- Use `validate(...)` middleware for request body validation before controllers run.
- Use `asyncHandler` for async route handlers.
- Use `HttpError` for expected request, validation, rate-limit, and provider errors.
- Use `sendSuccess` and `sendError` response envelopes from `src/utils/apiResponse.js`.
- Keep OpenAI calls behind `openai.client.js` or `openai.service.js`.
- Keep prompt text centralized in `src/ai/prompts/`.
- Keep runtime bird knowledge in `src/db/data/birds.json`; RAG embeddings are cached in memory at runtime.
- Log structured metadata through `src/utils/logger.js`.
- Mock OpenAI and PostgreSQL in tests.
- Add or update tests under `__tests__/` when changing behavior.

## Forbidden Patterns
- Do not put SQL in controllers or route files.
- Do not put prompt text in controllers or route files.
- Do not interpolate untrusted values into SQL strings.
- Do not log secrets, API keys, database URLs, tokens, passwords, or full secret-bearing headers.
- Do not expose stack traces or provider internals in API responses.
- Do not call external OpenAI or database services from the Jest suite.
- Do not introduce a new framework, ORM, validation library, or logging library without a clear project-level reason.
- Do not duplicate architecture documentation across markdown files; link to the source of truth instead.

## AI-First Development Principles
- Optimize changes for future AI agents: keep boundaries obvious, names descriptive, and files focused.
- Treat prompts and schemas as first-class source assets.
- Update [docs/prompting.md](../docs/prompting.md) when prompt behavior changes.
- Update [docs/memory.md](../docs/memory.md) when conversation context or persistence changes.
- Update [docs/api.md](../docs/api.md) when endpoint contracts change.
- Preserve conversation isolation by always filtering memory by `conversation_id`.
- Prefer small, testable changes over broad rewrites.

## Response Style Expectations
- Be concise and implementation-focused.
- Lead with the concrete change or finding.
- Reference exact files when explaining behavior.
- Mention tests run and any residual risk.
- Avoid generic advice that is not grounded in this repository.
