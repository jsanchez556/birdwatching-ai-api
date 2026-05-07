# Architecture

Back to [Project Context](../CONTEXT.md).

## Shape
This is a single-service Node.js API. There is no active `apps/` monorepo layout in the current tree.

```text
src/
  app.js                 Express app, CORS, JSON parsing, rate limit, routes, errors
  server.js              process entrypoint
  ai/                    OpenAI client/service, prompts, recommendation schema
  config/                environment parsing and validation
  controllers/           thin HTTP handlers
  db/                    pg pool, migrations, query modules
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

Recommendations use:
1. `RECOMMENDATION_PROMPT`
2. a generated user message with location, budget, and days
3. `recommendationSchema` as a forced OpenAI function tool response

## Persistence
The `messages` table stores one row per exchange:
- `conversation_id`
- `user_input`
- `ai_output`
- `created_at`

Recent context is loaded newest-first from PostgreSQL, reversed into chronological order before being sent to OpenAI.

## Cross-Cutting Concerns
- Errors are represented with `HttpError` and rendered by `error.middleware.js`.
- Response shape is centralized in `apiResponse.js`.
- Logging uses Winston and includes OpenAI request IDs and token usage when available.
- Database SSL is enabled only when `NODE_ENV=production`.
- Authentication is not enforced yet; `optionalAuth` is a placeholder for future protected routes.
