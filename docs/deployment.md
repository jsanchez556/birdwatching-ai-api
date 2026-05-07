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
- `CORS_ORIGINS`, comma-separated allowed origins; empty means no CORS allow-origin header is set
- `LOG_FILES_ENABLED`, `true` or `false`; defaults to console-only logging

Do not commit `.env` files. The local `.gitignore` excludes them.

## PostgreSQL
The app expects the `messages` table from:
```text
src/db/migrations/001_create_chat_interactions.sql
```

Run the migration with `psql`, Railway shell, or your deployment platform's database tooling before using chat memory.

Production database connections use SSL with `rejectUnauthorized: false`.

## Railway
`railway.json` uses Nixpacks and runs from the repository root:
```bash
npm install
npm start
```

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
- the database migration has run
