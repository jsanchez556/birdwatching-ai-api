# Prompting

Back to [Project Context](../CONTEXT.md). See [Memory](./memory.md) for how chat history is injected.

## Runtime Prompt Assets
- Prompt builder and message composition: `src/ai/prompts/prompt.builder.js`
- Versioned system and tool instructions: `src/ai/prompts/system.prompt.js`
- RAG context formatting: `src/ai/prompts/rag.context.js`
- User prompt templates: `src/ai/prompts/user.prompt.js`
- Structured recommendation schema: `src/ai/schemas/recommendation.schema.js`
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

`rag.service.js` then uses the prompt builder to optionally inject a second `system` message immediately
after the base system prompt. The retrieved context includes top matching bird
documents from `src/db/data/birds.json`, similarity scores, locations, and
descriptions. If retrieval or embedding fails, chat continues with the base
messages and an empty `sources` array.

`openai.client.createChatCompletionWithTools(...)` sends the messages with
tour tools enabled. When OpenAI returns tool calls, the app executes them,
appends `tool` role results, and asks OpenAI for the final conversational
response. Tool calls are executed sequentially so selection, pricing, and
reservation steps cannot race each other in one model turn.

Tour discovery should happen before booking: list or recommend database-backed
tours, return tour details through `/chat` response metadata, ask the user to
select a specific tour by ID or clear/partial name, then check availability,
price, and create the reservation. When tours are returned, the assistant text
should be minimal, for example: `I found 2 tours that match your preferences.`

Pricing supports optional discount codes and group discounts. Reservation
creation requires tour ID, participant count, and customer name, and may include
customer email and discount code.

Reservation tool results include durable confirmation fields. The final
assistant response should naturally include the reservation ID, customer name,
tour ID, participant count, confirmation code, created time, total price, and
any applied discount when present.

For non-tour topics such as bird species, birding locations, birdwatching tips,
or general questions, the chat prompt asks for 1-2 short sentences and no tour
tool calls unless the user asks about tours or reservations.

`openai.service.js` logs:
- prompt version
- message count
- response length
- conversation ID

`POST /chat` responses include prompt version metadata in the response `meta`
envelope for debugging and prompt experiments:
```json
{
  "promptVersions": {
    "chat": "2.1.0"
  }
}
```

## Recommendation Prompt Flow
`openai.client.js` asks `prompt.builder.js` to send:
1. `system`: `RECOMMENDATION_PROMPT`
2. `user`: generated request containing location, budget, and days
3. forced tool call: `get_bird_recommendation`

The parsed tool arguments become the API response body. If the tool response is absent or malformed, the service returns a provider error.

`POST /recommend` responses include recommendation prompt version metadata:
```json
{
  "promptVersions": {
    "recommendation": "1.0.0"
  }
}
```

## Change Rules
- Do not place prompt text in controllers or route files.
- Update prompt versions when behavior meaningfully changes.
- Keep prompts Costa Rica-specific unless the product scope changes.
- Keep chat tool instructions aligned with `src/ai/schemas/tour.schema.js`.
- Keep recommendation schema changes backward-aware; update [API Contracts](./api.md) and tests with schema changes.
- Prefer small prompt edits plus test cases over broad rewrites.

## Prompt History
`docs/development_prompts/` contains generation and implementation notes from earlier AI-assisted work. Treat those files as project history, not runtime prompt assets.
