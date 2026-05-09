# Prompting

Back to [Project Context](../CONTEXT.md). See [Memory](./memory.md) for how chat history is injected.

## Runtime Prompt Assets
- Chat system prompt: `src/ai/prompts/system.prompt.js`
- Recommendation system prompt: `src/ai/prompts/recommendation.prompt.js`
- Structured recommendation schema: `src/ai/recommendation.schema.js`

Prompt modules export both content and a semantic prompt version. Keep version changes intentional and loggable.

## Chat Prompt Flow
`conversation.service.js` first builds base OpenAI messages in this order:
1. `system`: `CHAT_SYSTEM_PROMPT`
2. recent historical `user` and `assistant` turns from the same conversation
3. current `user` message

`rag.service.js` then optionally injects a second `system` message immediately
after the base system prompt. The retrieved context includes top matching bird
documents from `src/db/data/birds.json`, similarity scores, locations, and
descriptions. If retrieval or embedding fails, chat continues with the base
messages and an empty `sources` array.

`openai.service.js` logs:
- prompt version
- message count
- response length
- conversation ID

## Recommendation Prompt Flow
`openai.client.js` sends:
1. `system`: `RECOMMENDATION_PROMPT`
2. `user`: generated request containing location, budget, and days
3. forced tool call: `get_bird_recommendation`

The parsed tool arguments become the API response body. If the tool response is absent or malformed, the service returns a provider error.

## Change Rules
- Do not place prompt text in controllers or route files.
- Update prompt versions when behavior meaningfully changes.
- Keep prompts Costa Rica-specific unless the product scope changes.
- Keep recommendation schema changes backward-aware; update [API Contracts](./api.md) and tests with schema changes.
- Prefer small prompt edits plus test cases over broad rewrites.

## Prompt History
`docs/development_prompts/` contains generation and implementation notes from earlier AI-assisted work. Treat those files as project history, not runtime prompt assets.
