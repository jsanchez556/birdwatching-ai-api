# Project Context

AI-agent entry point for the Birdwatching AI API. Read this file first, then follow links for deeper details.

## What This Is
This repository is a single Express API for Costa Rica birdwatching assistance. It supports:
- conversational chat with short-term PostgreSQL memory
- simple in-memory RAG over `src/db/data/birds.json`
- OpenAI tool calling for tour discovery, selection, availability, pricing, discounts, and durable reservations
- structured trip recommendations from OpenAI function tool calls
- normalized JSON responses and centralized error handling
- Railway-oriented deployment with environment-driven configuration

## Source Of Truth Map
- Human overview and setup: [README.md](./README.md)
- Agent rules and coding conventions: [AGENTS.md](./AGENTS.md)
- Architecture and flow diagrams: [docs/architecture.md](./docs/architecture.md)
- Endpoint contracts: [docs/api.md](./docs/api.md)
- Prompt assets and versioning: [docs/prompting.md](./docs/prompting.md)
- Conversation memory behavior: [docs/memory.md](./docs/memory.md)
- Deployment and environment: [docs/deployment.md](./docs/deployment.md)
- Backend implementation rules: [docs/backend-guidelines.md](./docs/backend-guidelines.md)

## Current Architecture
The app uses a controller-service-query split:
- `src/routes/*` binds HTTP paths to middleware and controllers.
- `src/controllers/*` extracts request data, logs request metadata, and returns response envelopes.
- `src/services/*` owns orchestration, AI calls, memory construction, and persistence decisions.
- `src/db/queries/*` owns parameterized calls to PostgreSQL functions through `src/db/pool.js`.
- `src/ai/*` owns OpenAI client calls, prompt assets, structured schemas, and chat tool adapters.
- `src/middleware/*` owns validation, rate limiting, errors, and future auth hooks.

## Runtime Flows
Chat:
```text
POST /chat
  -> validateChatBody
  -> chat.controller.handleChat
  -> chat.service.processMessage
  -> conversation.service.buildConversationContext
  -> rag.service.buildContext
  -> openai.service.generateResponseWithTools
  -> openai.client.createChatCompletionWithTools
  -> optional src/ai/tools execution for tour operations
  -> optional tour.service listing, recommendation, or selection
  -> reservation.service and reservation.queries for durable bookings
  -> conversation.service.saveExchange
  -> { success, data: { conversationId, response, sources }, meta: { toolsCalled, tours, selectedTour, reservation } }
```

Recommendation:
```text
POST /recommend
  -> validateRecommendationBody
  -> recommendation.controller.handleRecommendation
  -> recommendation.service.getRecommendations
  -> openai.client.createStructuredRecommendation
  -> OpenAI function tool: get_bird_recommendation
  -> { success, data, meta }
```

Conversation lookup:
```text
GET /chat/:conversationId
  -> chat.controller.handleGetConversation
  -> chat.service.getConversationMessages
  -> conversation.service.getConversationMessages
  -> conversation.queries.getByConversationId
```

## Important Implementation Facts
- ESM is enabled through `"type": "module"` in `package.json`.
- Express JSON payloads are limited to `64kb`.
- CORS is manually implemented in `src/app.js` from `CORS_ORIGINS`.
- Rate limiting is an in-memory per-IP bucket: 60 requests per minute.
- `optionalAuth` exists as a placeholder; active routes are currently public.
- `NODE_ENV=test` bypasses required `OPENAI_API_KEY` and `DATABASE_URL` validation.
- OpenAI retry behavior lives in `src/utils/asyncRetry.js` and is used for transient OpenAI statuses.
- RAG loads `src/db/data/birds.json`, flattens family-keyed bird groups into documents, embeds them on first use, stores vectors in memory, and falls back to normal chat if retrieval fails.
- Tour data, availability, selection, and reservations are stored in PostgreSQL through functions in `003_create_tour_reservations.sql`.
- Tour listing and recommendation details are returned in the `/chat` response `meta` envelope for frontend rendering; assistant text stays short when tours are present.
- Tour selection accepts a tour ID or a clear/partial tour name such as `Monteverde tour` before pricing or reservation.
- Reservation creation can include optional `customerEmail` and `discountCode`; discounts are calculated in `reservation.service.js` and the final total is computed inside the PostgreSQL function.
- Database writes for chat memory are best-effort; save failures are logged but do not fail the chat response.
- Chat persistence uses the `conversations` and `messages` tables plus SQL helper functions from `src/db/migrations/002_create_functions.sql`.
- Reservation persistence uses `tours` and `reservations` plus PostgreSQL functions from `003_create_tour_reservations.sql`; transaction and row locking logic lives in the database function.

## Testing
Tests live in `__tests__/` and cover routes, services, and query helpers with ESM module mocks.

Run:
```bash
npm test
```

## When Extending
1. Add or update validators in `src/validators/`.
2. Keep controllers thin and request-focused.
3. Put orchestration in `src/services/`.
4. Put SQL in `src/db/queries/` and use parameterized queries.
5. Put prompt text and schemas in `src/ai/`.
6. Update the relevant docs link above when behavior changes.
