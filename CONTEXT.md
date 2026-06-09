# Project Context

AI-agent entry point for the Birdwatching AI API. Read this file first, then follow links for deeper details.

## What This Is
This repository is a single Express API for Costa Rica birdwatching assistance. It supports:
- conversational chat with short-term PostgreSQL memory
- PostgreSQL-backed RAG over ingested `src/db/ingestion/data` documents using pgvector
- reusable external bird data clients for eBird, iNaturalist, and Xeno-canto ingestion jobs
- media file lookup for relative bird media keys through CloudFront or `GET /files/:folderName/:filename`
- public homepage content for hero media, featured tours, bird highlights, and transportation add-ons
- voice chat through `POST /voice-chat`, combining speech-to-text, chat orchestration, text-to-speech, S3 storage, and CloudFront-relative audio URLs
- OpenAI/agent tool calling for tour search, availability, transportation, pricing, discounts, and durable reservations
- normalized JSON responses and centralized error handling
- email/password authentication with bcrypt password hashes and JWT-protected AI routes
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
- `src/db/vector`, `src/db/retrieval`, `src/db/ingestion`, and `src/db/chunking` own durable RAG storage, search, ingestion, and chunking.
- `src/external/` owns provider HTTP clients and shared external API rate limiting for bird data ingestion.
- `src/routes/media.routes.js` owns CloudFront media URL creation for relative media keys; `src/storage/` remains for S3 uploads and object checks used by ingestion jobs.
- `src/ai/*` owns OpenAI client calls, prompt assets, structured schemas, and chat tool adapters.
- `src/middleware/*` owns validation, sanitization, security headers, CORS protection, rate limiting, errors, and auth hooks.

## Runtime Flows
Chat:
```text
POST /chat
  -> optionalAuth
  -> authenticated AI rate limit or visitor AI rate limit
  -> validateChatBody
  -> chat.controller.handleStreamChat
  -> chat.service.processMessageStream
  -> visitor role/topic authorization when no JWT is present
  -> conversation.service.assertCanAccess
  -> conversation.service.buildConversationContext
  -> rag.service.buildContext
  -> PostgreSQL pgvector retrieval
  -> frontend-safe sources and media-rich birdMatches metadata when matching bird profiles are retrieved
  -> agent orchestrator plans and executes required chat tools
  -> OpenAI streams final assistant text through SSE chunk events with client-disconnect abort support
  -> conversation.service.saveExchange
  -> SSE start/chunk/replace/done/error events
```

Latest conversation lookup:
```text
GET /chat/latest
  -> requireAuth
  -> chat.controller.handleGetLatestConversation
  -> chat.service.getLatestConversation
  -> conversation.service.getLatestConversationForUser
  -> conversation.queries.getLatestByUserId
  -> conversation.queries.getByConversationId
```

## Important Implementation Facts
- ESM is enabled through `"type": "module"` in `package.json`.
- Express JSON payloads are limited to `64kb`.
- Security headers, CORS protection, and request sanitization are applied through `src/middleware/security.middleware.js`; CORS uses `CORS_ORIGINS`.
- Rate limiting is an in-memory per-IP bucket: 60 requests per minute.
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/logout` are public; login/signup issue access tokens plus DB-backed rotating refresh tokens, refresh rotates sessions, and logout revokes the supplied refresh token.
- `POST /chat` accepts JWT-authenticated customer/admin users or unauthenticated visitor requests, while `GET /chat/latest` requires JWT bearer auth through `requireAuth`.
- Visitor chat is limited to bird-related questions, cannot execute tour/reservation tools, and uses a stricter in-memory IP limit.
- `NODE_ENV=test` bypasses required `OPENAI_API_KEY`, `DATABASE_URL`, and `JWT_SECRET` validation.
- OpenAI retry behavior lives in `src/utils/asyncRetry.js` and is used for transient OpenAI statuses.
- Streaming chat passes an `AbortSignal` to OpenAI and skips saving a completed exchange when the client disconnects before completion.
- RAG reads only from PostgreSQL pgvector during chat. Use `npm run ingest` to ingest normalized JSON datasets from `src/db/ingestion/data` before relying on RAG context; chat does not chunk documents, generate source embeddings, or write vectors.
- Bird RAG metadata may include `meta.birdMatches[].media` with absolute URLs or relative object keys such as `/photos/123_medium.jpg`, `songs/123.mp3`, or `sonograms/123_grey-small.png`. Relative keys are intentionally not public static paths; the UI resolves them through CloudFront when configured or through `GET /files/:folderName/:filename`, which returns a normalized envelope containing `data.url`.
- `GET /files/:folderName/:filename` normalizes and validates path segments, then returns a CloudFront URL from `CLOUDFRONT_BASE_URL`; it no longer creates S3 presigned URLs.
- External bird data clients live under `src/external/clients/` and export orchestration lives under `src/external/services/` behind `src/external/export.service.js`. They are intended for ingestion jobs, not request handlers, and share a configurable rate limiter capped at 40 requests per minute.
- `npm run external` exports provider JSON into `src/external/data` in `taxo`, `sounds`, `photos` order with file-age and per-species cache checks before future normalization or ingestion steps. eBird recent observations are fetched per species code from the Costa Rica species list and written incrementally as keyed `{ locations, lstDt }` summaries.
- Tour data, availability, selection, and reservations are stored in PostgreSQL through functions in `003_create_tour_reservations.sql`; the tour helpers join the Costa Rica `country`/`zone`/`node`/`birds`/`birds_by_node` reference graph and return `location`, `node`, `subnode`, and `zone` for tour discovery, selection, and reservation metadata.
- Tour listing, recommendation, guided action, pricing, transportation, and reservation details are returned in the `/chat` stream `done.meta` object for frontend rendering; assistant text stays short when structured metadata is present.
- Tour selection accepts a tour ID or a clear/partial tour name such as `Monteverde tour` before pricing or reservation.
- `GET /chat/latest` loads the most recent conversation for `req.user.id` before the frontend creates a new conversation ID. If that conversation has a reservation, the response includes frontend-safe `meta.reservation` details plus chat-level booking state such as `meta.participants` and `meta.selectedTransportation`. Chat requests can include `customerContext` with name, email, and itinerary dates plus `conversationContext.recentAssistantMetadata` for continuing guided booking flows. For authenticated requests, the JWT user email is authoritative and the JWT user name is preferred when available.
- Reservation creation can include optional `customerEmail`, `discountCode`, itinerary dates, and selected transportation metadata; discounts are calculated in `reservation.service.js` and the tour total is computed inside the PostgreSQL function.
- Database writes for chat memory are best-effort; save failures are logged but do not fail the chat response.
- Authenticated chat requests persist OpenAI prompt tokens, completion tokens, and estimated cost to `usage_logs` on a best-effort basis after the streamed response completes.
- Chat persistence uses the `conversations` and `messages` tables plus SQL helper functions from `src/db/migrations/002_create_functions.sql`; later migrations make those helpers owner-aware and merge safe JSONB booking metadata into `conversations.metadata`.
- Voice chat uses the same chat orchestration and conversation memory as `POST /chat`. `src/ai/audio/speechToText.js` and `src/ai/audio/textToSpeech.js` are internal services; standalone transcribe/speak routes are not exposed publicly.
- `POST /voice-chat` accepts raw MP3/WAV audio only, including `audio/mpeg`, `audio/mp3`, `audio/wav`, and `audio/x-wav`. Browser clients that record `audio/webm` should convert to WAV before upload or the backend validation will reject the request.
- Generated voice-chat MP3 responses are uploaded to S3 under `voice-chat/<uuid>.mp3`; the API returns a relative `/files/voice-chat/...` URL that clients resolve through CloudFront-backed media delivery.
- Voice chat creates one LangSmith-compatible parent trace with child spans for transcription, conversation context/RAG retrieval, agent execution/tool work, final chat response, and speech generation when tracing is enabled.
- User authentication uses `users`, DB-backed refresh sessions use `refresh_tokens`, and authenticated token/cost accounting uses `usage_logs`.
- Reservation persistence uses `tours` and `reservations` plus PostgreSQL functions from `003_create_tour_reservations.sql`; transaction, row locking, derived tour location metadata, and authenticated `user_id` persistence live in database functions after ownership migration. Chat-level booking metadata such as transportation selections is stored in `conversations.metadata`.

## Testing
Tests live in `__tests__/` and cover routes, services, and query helpers with ESM module mocks.

Run:
```bash
npm test
```

## When Extending
1. Add or update validators in `src/validators/`.
2. Controllers must only parse HTTP requests, validate and authorize input, and call services. Do not perform business logic, database access, or OpenAI prompt composition inside controllers.
3. Put orchestration in `src/services/`.
4. Put SQL in `src/db/queries/` and use parameterized queries.
5. Put prompt text and schemas in `src/ai/`.
6. Update the relevant docs link above when behavior changes.
