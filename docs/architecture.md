# Architecture

Back to [Project Context](../CONTEXT.md).

## Shape
This is a single-service Node.js API. There is no active `apps/` monorepo layout in the current tree.

```text
src/
  app.js                 Express app, CORS, JSON parsing, rate limit, routes, errors
  server.js              process entrypoint
  ai/                    OpenAI client/service, prompts, schemas, chat tools
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
2. optional retrieved context from `src/db/data/birds.json` through in-memory vector search
3. up to 10 recent exchanges from the same `conversation_id`
4. the current user message

RAG uses:
1. `embeddings.service.js` to load `src/db/data/birds.json`, flatten family-keyed bird groups into documents, generate OpenAI `text-embedding-3-small` embeddings, and cache embedded documents in memory
2. `vectorSearch.service.js` to normalize vectors and rank documents with cosine similarity
3. `rag.service.js` to retrieve top matches and inject a compact system context message into chat prompts

Chat tool calling uses:
1. `openai.client.createChatCompletionWithTools(...)` with `tool_choice: 'auto'` and sequential tool calls
2. tool schemas from `src/ai/schemas/tour.schema.js`
3. registry validation and dispatch through `src/ai/tools/index.js`
4. thin tour adapters in `src/ai/tools/tour-tools.js`
5. tour listing, recommendation, and selection in `src/services/tour.service.js`
6. reservation orchestration in `src/services/reservation.service.js`
7. PostgreSQL function calls in `src/db/queries/tour.queries.js` and `src/db/queries/reservation.queries.js`
8. frontend-safe tool metadata collected on the chat response `meta` envelope
9. a follow-up OpenAI chat completion with `tool` messages so the user receives a natural response

The current tour tool set is:
- `getAvailableTours`
- `recommendTours`
- `selectTour`
- `checkTourAvailability`
- `calculateTourPrice`
- `createReservation`

Tour listing and recommendation results are returned through `/chat` response
metadata, so assistant text can stay short, such as `I found 2 tours that match
your preferences.` Explicit tour selection can be made by ID or clear/partial
tour name; service matching resolves names such as `Monteverde tour` to the
database-backed tour before selection validation.

Tour data, availability, and reservations are stored in PostgreSQL. `createReservation`
normalizes reservation arguments, calculates the best discount from supported
discount codes or group size, generates a confirmation code, and calls
`create_tour_reservation(...)`. The database function locks the tour row,
verifies available slots, updates availability, calculates the final total, and
inserts the reservation in one database transaction.

Future tools should be added as a group with schemas and handlers keyed by the
OpenAI `function.name`. The registry rejects duplicate names and schemas without
matching handlers.

Recommendations use:
1. `RECOMMENDATION_PROMPT`
2. a generated user message with location, budget, and days
3. `recommendationSchema` as a forced OpenAI function tool response

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
- Authentication is not enforced yet; `optionalAuth` is a placeholder for future protected routes.
