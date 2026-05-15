# Birdwatching AI API

REST API for Costa Rica birdwatching chat, trip recommendations, and conversation memory. The service is a single Node.js/Express app rooted at `src/` and integrates OpenAI with PostgreSQL persistence.

## Quick Links
- Project context for AI agents: [CONTEXT.md](./CONTEXT.md)
- Agent coding rules: [AGENTS.md](./AGENTS.md)
- Architecture details: [docs/architecture.md](./docs/architecture.md)
- API contracts: [docs/api.md](./docs/api.md)
- Prompting: [docs/prompting.md](./docs/prompting.md)
- Memory design: [docs/memory.md](./docs/memory.md)
- Deployment: [docs/deployment.md](./docs/deployment.md)

## Stack
- Node.js ESM, Express 5
- OpenAI SDK chat completions and function tool calls
- PostgreSQL via `pg`
- Winston JSON logging
- Jest 30 with Supertest

## Local Setup
```bash
npm install
npm run dev
```

Required runtime variables are validated in `src/config/env.js`:
- `OPENAI_API_KEY`
- `DATABASE_URL`

Common optional variables:
- `PORT` defaults to `3000`
- `NODE_ENV` defaults to `development`
- `OPENAI_MODEL` defaults to `gpt-4o`
- `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`
- `CORS_ORIGINS` accepts a comma-separated allowlist
- `LOG_FILES_ENABLED` accepts `true` or `false`

Run database migrations before using chat memory:
```bash
psql "$DATABASE_URL" -f src/db/migrations/001_create_chat_interactions.sql
psql "$DATABASE_URL" -f src/db/migrations/002_create_functions.sql
psql "$DATABASE_URL" -f src/db/migrations/003_create_tour_reservations.sql
psql "$DATABASE_URL" -f src/db/migrations/004_create_vector_knowledge.sql
```

## Bird Knowledge Base
Chat responses use a PostgreSQL-backed RAG flow with `pgvector`. Documents must
be ingested from `src/db/data` before retrieval can return RAG context. The
ingestion command parses supported source files, chunks each document, embeds
chunks with the OpenAI embeddings API, and persists documents, chunks, metadata,
and vectors in PostgreSQL.

Run ingestion after migrations and whenever source knowledge files change:
```bash
npm run ingest              # ingest all supported files in src/db/data
npm run ingest -- birds.json
npm run ingest -- file1.json file2.md
npm run ingest -- --all
```

Supported source files currently include `.json` and `.md`. The current
`birds.json` shape is a family-keyed object of bird arrays, and generic JSON
document arrays or `{ "documents": [...] }` files are also supported.

Semantic retrieval runs through `src/db/retrieval/retrieval.service.js` and
`src/db/vector/vector.repository.js`, with optional metadata filters for fields
such as source, category, document type, locale, tags, and JSON metadata. If
PostgreSQL or `pgvector` is unavailable, chat continues without RAG context.
Chat requests do not run ingestion, generate embeddings for source documents, or
write vectors.

## Tour Tools
Chat can use OpenAI tool calling for tour listing, tour recommendations,
explicit tour selection, availability checks, price calculations, discounts, and
durable reservation creation. Tool schemas and dispatch live in
`src/ai/schemas/` and `src/ai/tools/`. Tour listing, recommendations,
selection, and reservation state are stored in PostgreSQL through
`src/db/queries/tour.queries.js` and `src/db/queries/reservation.queries.js`.

Tour listing and recommendation results are returned through the `/chat`
response `meta` envelope for frontend rendering, while assistant text stays
short. Explicit selection can use a tour ID or a clear/partial tour name before
pricing or reservation.

Reservations can include an optional customer email and discount code. The
backend calculates group or code-based discounts before calling the transactional
PostgreSQL reservation function.

## Scripts
```bash
npm start      # node src/server.js
npm run dev    # nodemon src/server.js
npm run ingest # ingest all supported src/db/data files into pgvector
npm test       # Jest ESM test runner
```

## Runtime Endpoints
- `GET /health`
- `POST /chat`
- `GET /chat/:conversationId`
- `POST /recommend`

Responses use the normalized envelope from `src/utils/apiResponse.js`.

## Persistence
PostgreSQL stores one `conversations` row per conversation ID and one
`messages` row per user/assistant exchange. Query modules call PostgreSQL
functions from migrations instead of embedding persistence SQL in JavaScript.
Tour reservations use PostgreSQL `tours` and `reservations` tables from
`003_create_tour_reservations.sql`, including database functions for tour lookup
and transactional reservation creation.

RAG persistence uses `knowledge_documents` and `knowledge_chunks` from
`004_create_vector_knowledge.sql`. The migration enables the `vector` extension
and creates indexes for semantic search and metadata filtering.
