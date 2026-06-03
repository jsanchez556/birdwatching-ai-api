# Prompting

Back to [Project Context](../CONTEXT.md). See [Memory](./memory.md) for how chat history is injected.

## Runtime Prompt Assets
- Prompt builder and message composition: `src/ai/prompts/prompt.builder.js`
- Versioned system and tool instructions: `src/ai/prompts/system.prompt.js`
- RAG context formatting: `src/ai/prompts/rag.context.js`
- Booking planner and agent wiring: `src/ai/agents/birdwatching.agent.js`
- Chat orchestration: `src/ai/orchestrators/agent.orchestrator.js`
- Chat tour tool schemas: `src/ai/schemas/tour.schema.js`

Prompt modules export both content and a semantic prompt version. Keep version changes intentional and loggable.

## Chat Prompt Flow
`prompt.builder.js` exposes a generic prompt composition API:
```js
buildPrompt({
  systemPrompt,
  ragContext,
  memoryContext,
  userMessage,
});
```

`conversation.service.js` asks `prompt.builder.js` to build base OpenAI messages
in this order:
1. `system`: `CHAT_SYSTEM_PROMPT`
2. recent historical `user` and `assistant` turns from the same conversation
3. current `user` message

`rag.service.js` then uses the prompt builder to optionally inject a second
`system` message immediately after the base system prompt. The retrieved context
comes from PostgreSQL pgvector-backed knowledge chunks created by
`npm run ingest`; source files live under `src/db/ingestion/data` as normalized
JSON arrays. Retrieved sources can
include similarity scores, locations, snippets, and document metadata. If
retrieval or embedding fails, chat continues with the base messages and an empty
`sources` array.

Bird profile ingestion embeds searchable text such as common name, scientific
name, family, locations, descriptions, recent observations, and media
availability hints. Media URLs for photos, songs, and sonograms stay in document
metadata and can be exposed to the UI through `done.meta.birdMatches`; the model
should answer from retrieved text rather than treating media URLs as embedded
knowledge.

`agent.orchestrator.js` plans booking/tool steps, `ToolExecutor` executes the
registered tools with retry and trace metadata, and the final assistant response
is streamed after tool work is complete. Tool steps are executed in plan order
so availability, transportation, pricing, and reservation steps cannot race each
other in one model turn.

Tour discovery should happen before booking: use `searchTours` to list or
recommend database-backed tours, return tour details through stream `done` event
metadata, ask the user to select a specific tour by ID or clear/partial name,
then check availability, estimate transportation when requested, price, and
create the reservation. When tours are returned, the assistant text should be
minimal, for example: `I found 2 tours that match your preferences.`

Pricing supports optional discount codes and group discounts. Reservation
creation requires participant count and customer name, and can resolve the tour
from ID, clear tour name, or location. Customer name, email, and itinerary dates
should come from frontend `customerContext` when present.

Reservation tool results include durable confirmation fields and optional
frontend-safe transportation and itinerary metadata. The final assistant response
should stay short when `meta.reservation` is present because the frontend renders
the detailed confirmation card.

For non-tour topics such as bird species, birding locations, birdwatching tips,
or general questions, the chat prompt asks for 1-2 short sentences and no tour
tool calls unless the user asks about tours or reservations.

`openai.service.js` logs:
- prompt version
- message count
- response length
- conversation ID

`POST /chat` responses include prompt version metadata in the `done`
event `meta` object for debugging and prompt experiments:
```json
{
  "promptVersions": {
    "chat": "2.3.0"
  }
}
```

## Change Rules
- Do not place prompt text in controllers or route files.
- Update prompt versions when behavior meaningfully changes.
- Keep prompts Costa Rica-specific unless the product scope changes.
- Keep chat tool instructions aligned with `src/ai/schemas/tour.schema.js`.
- Prefer small prompt edits plus test cases over broad rewrites.

## Prompt History
`docs/development_prompts/` contains generation and implementation notes from earlier AI-assisted work. Treat those files as project history, not runtime prompt assets.
