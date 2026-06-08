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
- `JWT_SECRET`

Optional:
- `PORT`, defaults to `3000`
- `NODE_ENV`, defaults to `development`; allowed values are `development`, `test`, `production`
- `OPENAI_MODEL`, defaults to `gpt-4o`
- `OPENAI_EMBEDDING_MODEL`, defaults to `text-embedding-3-small`
- `LANGCHAIN_API_KEY`, enables LangSmith trace export when set with `LANGCHAIN_TRACING=true`
- `LANGCHAIN_TRACING`, set to `true` to enable LangSmith-compatible tracing
- `LANGCHAIN_PROJECT`, defaults to `birdwatching-ai`
- `CORS_ORIGINS`, comma-separated allowed origins; empty means no CORS allow-origin header is set
- `LOG_FILES_ENABLED`, `true` or `false`; defaults to console-only logging
- `JWT_EXPIRES_IN`, defaults to `7d`
- `E_BIRD_API_BASE_URL`, required when using eBird ingestion clients
- `E_BIRD_API_KEY`, required when using eBird ingestion clients
- `INATURALIST_API_BASE_URL`, required when using iNaturalist ingestion clients
- `XENO_CANTO_API_BASE_URL`, required when using Xeno-canto ingestion clients
- `XENO_CANTO_API_KEY`, required when using Xeno-canto ingestion clients
- `EXTERNAL_API_RATE_LIMIT_WINDOW_MS`, defaults to `60000`
- `EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS`, defaults to `40` and cannot exceed `40`
- `S3_ENDPOINT_URL`, required when using media asset uploads
- `S3_REGION`, required when using media asset uploads
- `S3_BUCKET_NAME`, required when using media asset uploads
- `S3_ACCESS_KEY_ID`, required when using media asset uploads
- `S3_SECRET_ACCESS_KEY`, required when using media asset uploads

Do not commit `.env` files. The local `.gitignore` excludes them.

## PostgreSQL
The app expects tables and SQL helper functions from:
```text
src/db/migrations/001_create_chat_interactions.sql
src/db/migrations/002_create_functions.sql
src/db/migrations/003_create_tour_reservations.sql
src/db/migrations/004_create_vector_knowledge.sql
src/db/migrations/005_create_users.sql
src/db/migrations/006_add_user_ownership.sql
src/db/migrations/007_save_conversation_metadata.sql
src/db/migrations/008_create_usage_logs.sql
src/db/migrations/009_add_user_roles.sql
src/db/migrations/010_create_refresh_tokens.sql
src/db/migrations/011_tours_refactor.sql
```

Run migrations in order with `psql`, Railway shell, or your deployment platform's database tooling before using chat memory, reservations, users, refresh-token sessions, usage logging, tour-location metadata, or pgvector-backed RAG.

Production database connections use SSL with `rejectUnauthorized: false`.

## Runtime Data
- RAG source datasets live under `src/db/ingestion/data` as normalized JSON arrays and must be ingested with `npm run ingest` after vector migrations run.
- External bird data clients for eBird, iNaturalist, and Xeno-canto live under `src/external/`. They are reusable building blocks for ingestion jobs and are rate-limited to no more than 40 requests per minute before data is normalized for the vector store.
- External provider JSON exports are written to `src/external/data` by `npm run external -- taxo sounds photos`. With no provider arguments, `npm run external` runs that same order. The eBird taxonomy export is incremental from the refreshed species list, eBird recent observations are fetched per species code from that list and written incrementally as a keyed `{ locations, lstDt }` summary, and the eBird species list, simplified Xeno-canto songs export, and iNaturalist per-species image lookups are valid for one year.
- RAG retrieval reads PostgreSQL `knowledge_documents` and `knowledge_chunks`; chat requests do not ingest files or write vectors.
- Tour seed data begins in `003_create_tour_reservations.sql`; `011_tours_refactor.sql` adds tour `node_id`, coordinates, start/end dates, and the `country`/`zone`/`node`/`birds`/`birds_by_node` reference tables for Costa Rica birding geography and target species.
- Tour reservation availability is durable PostgreSQL state and is updated transactionally by PostgreSQL functions.

## AI Observability
Centralized AI telemetry lives under `src/observability`, `src/tracing`, and `src/monitoring`.
Tracing is safe to leave disabled locally; the app still records internal latency,
token, and error telemetry without requiring LangSmith credentials. When LangSmith
credentials are present, the observability service creates and updates sanitized
LangSmith runs through the `langsmith` SDK.

Set the following variables to export traces to LangSmith:
```bash
LANGCHAIN_TRACING=true
LANGCHAIN_PROJECT=birdwatching-ai
LANGCHAIN_API_KEY=<langsmith-api-key>
```

Current AI trace boundaries:
- Root streamed chat AI execution flow, including response length, source count, prompt versions, reservations, and tool names
- Conversation context assembly, including prompt/memory message counts by role
- LLM chat completions for tool resolution and final streaming responses
- OpenAI embedding generation used by RAG retrieval
- RAG pipeline calls, including retrieval latency, retrieved chunk summaries, similarity scores, grounding context, and prompt construction metadata
- Agent orchestration, including user request metadata, planning, tool sequence, prompt assembly, and final response generation
- Multi-tool execution flows, including planner output, ordered tool steps, failures, skipped steps, retry counts, and retry scheduling events
- Tour tool execution through the registry and agent executor

Verify traces by running a chat request with the variables above set, then checking
the `birdwatching-ai` project in LangSmith. Application logs also include
`ai_trace_started`, `ai_trace_completed`, `ai_trace_failed`, and `ai_token_usage`
events with redacted metadata.

AI error monitoring emits `AI error monitored` log entries with stable event names:
- `retrieval_failed` for failed RAG retrievals
- `tool_timeout` for timeout-class tool failures
- `tool_failed` for non-timeout tool failures
- `invalid_json_output` for malformed model tool-call arguments
- `invalid_output` for assistant output blocked by output guardrails
- `hallucination_event` for guardrail-detected unsupported or unsafe assistant output
- `prompt_evaluation_tracked` for prompt version comparison telemetry

LangSmith evaluation feedback keys:
- `grounding_quality`
- `answer_relevance`
- `tool_correctness`

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

For Railway object storage, create or attach a bucket, then copy the
S3-compatible endpoint URL, region, bucket name, access key ID, and secret access
key into the variables above. The app uses path-style S3 requests for compatible
endpoints. Store these values only in Railway variables and local `.env`; never
commit credentials or expose them in API responses.

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
- `JWT_SECRET` is set to a strong secret and not exposed to the frontend
- all database migrations have run
- `npm run ingest` has been run after RAG source file changes
