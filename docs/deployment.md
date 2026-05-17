# Deployment

Back to [Project Context](../CONTEXT.md).

## Runtime
Start command:
```bash
npm start
```

Development command:
```bash
npm run dev
```

The server listens on `0.0.0.0` and uses `PORT` from `src/config/env.js`.

## Environment Variables
Required outside tests:
- `OPENAI_API_KEY`
- `DATABASE_URL`

Optional:
- `PORT`, defaults to `3000`
- `NODE_ENV`, defaults to `development`; allowed values are `development`, `test`, `production`
- `OPENAI_MODEL`, defaults to `gpt-4o`
- `OPENAI_EMBEDDING_MODEL`, defaults to `text-embedding-3-small`
- `CORS_ORIGINS`, comma-separated allowed origins; empty means no CORS allow-origin header is set
- `LOG_FILES_ENABLED`, `true` or `false`; defaults to console-only logging

Do not commit `.env` files. The local `.gitignore` excludes them.

## PostgreSQL
The app expects tables and SQL helper functions from:
```text
src/db/migrations/001_create_chat_interactions.sql
src/db/migrations/002_create_functions.sql
src/db/migrations/003_create_tour_reservations.sql
src/db/migrations/004_create_vector_knowledge.sql
```

Run migrations in order with `psql`, Railway shell, or your deployment platform's database tooling before using chat memory, reservations, or pgvector-backed RAG.

Production database connections use SSL with `rejectUnauthorized: false`.

## Runtime Data
- Bird RAG source files live under `src/db/data` and must be ingested with `npm run ingest` after vector migrations run.
- RAG retrieval reads PostgreSQL `knowledge_documents` and `knowledge_chunks`; chat requests do not ingest files or write vectors.
- Tour seed data is stored in `003_create_tour_reservations.sql` and runtime tour data is PostgreSQL-backed.
- Tour reservation availability is durable PostgreSQL state and is updated transactionally by PostgreSQL functions.

## CORS
`CORS_ORIGINS` is parsed as a comma-separated allowlist. If it includes `*`,
the app responds with `Access-Control-Allow-Origin: *`. If the incoming origin
matches an allowlisted origin, that origin is echoed. If the allowlist is
non-empty and the incoming origin does not match, the first configured origin is
sent. If the allowlist is empty, no allow-origin header is set.

## Railway
`railway.json` uses Nixpacks and runs from the repository root:
```bash
npm install
npm start
```

The current Railway config sets `build.buildCommand` to `npm install` and
`deploy.startCommand` to `npm start`.

## Docker And Vercel
No `Dockerfile`, `docker-compose.yml`, or `vercel.json` exists in the current tree. Add those only when there is an actual deployment target to support.

## Pre-Deploy Checks
```bash
npm test
```

Also verify:
- required environment variables are present in the host
- `CORS_ORIGINS` matches the frontend origin
- OpenAI model access is available for `OPENAI_MODEL`
- OpenAI embedding model access is available for `OPENAI_EMBEDDING_MODEL`
- all database migrations have run
- `npm run ingest` has been run after RAG source file changes
