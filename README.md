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

## Bird Knowledge Base
Chat responses use a simple in-memory RAG flow. Documents are loaded from
`birds.json`, embedded with the OpenAI embeddings API on first use, ranked with
cosine similarity, and injected into the chat prompt when relevant.

## Scripts
```bash
npm start   # node src/server.js
npm run dev # nodemon src/server.js
npm test    # Jest ESM test runner
```

## Runtime Endpoints
- `GET /health`
- `POST /chat`
- `GET /chat/:conversationId`
- `POST /recommend`

Responses use the normalized envelope from `src/utils/apiResponse.js`.
