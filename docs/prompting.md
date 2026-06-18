# Prompting

Back to [Project Context](../CONTEXT.md). See [Memory](./memory.md) for how chat history is injected.

## Runtime Prompt Assets
- Prompt builder and message composition: `src/ai/prompts/prompt.builder.js`
- Versioned system and tool instructions: `src/ai/prompts/system.prompt.js`
- Bird image analysis instructions: `src/ai/prompts/birdImageAnalysis.prompt.js`
- Bird identification instructions: `src/ai/prompts/birdIdentification.prompt.js`
- RAG context formatting: `src/ai/prompts/rag.context.js`
- Booking planner and agent wiring: `src/ai/agents/birdwatching.agent.js`
- Bird identification agent: `src/ai/agents/birdIdentification.agent.js`
- Chat orchestration: `src/ai/orchestrators/agent.orchestrator.js`
- Chat tour tool schemas: `src/ai/schemas/tour.schema.js`
- Bird image analysis response schema: `src/ai/schemas/birdImageAnalysis.schema.js`
- Bird identification response schema: `src/ai/schemas/birdIdentification.schema.js`

Prompt modules export both content and a semantic prompt version. Keep version changes intentional and loggable.

## Bird Identification Prompt Flow
Bird identification uses three model-facing stages, all returning JSON through strict response schemas:

1. `birdImageAnalysis.service.js` uses `BIRD_IMAGE_ANALYSIS_SYSTEM_PROMPT` to extract rich visible evidence only: dominant plumage colors, field marks, bill color/shape/length, head/throat/upperpart/underpart/tail/wing details, apparent group, habitat hints when visible, image quality, and visual-analysis confidence. It must not guess species, exact location, photographer details, season, behavior, or hidden context.
2. `birdIdentification.agent.js` uses `BIRD_CANDIDATE_GENERATION_SYSTEM_PROMPT` to generate 0-5 conservative candidates from the visual evidence and, when available, the provider-readable image URL. Candidates include `commonName`, optional `scientificName`, confidence, reasoning, visible evidence, possible confusions, and missing evidence. Weak evidence should return multiple candidates or `unknown`, not a forced species.
3. `birdIdentification.agent.js` uses `BIRD_IDENTIFICATION_VERIFICATION_SYSTEM_PROMPT` to compare candidates against retrieved bird-profile RAG, preserve visual evidence as primary, add `ragSupport`, note contradictions/missing evidence, rerank, and calibrate final confidence.

Confidence calibration is enforced in service code as well as prompts: `0.90+` requires distinctive diagnostic traits, `0.70-0.89` is likely, `0.40-0.69` is plausible/uncertain, best candidate below `0.55` returns `uncertain`, and below `0.40` returns `unknown`. Blurry, distant, obscured, cropped, backlit, or otherwise weak images cap confidence so final responses do not claim certainty from poor evidence.

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
`npm run enrich -- birds`; source files live under `src/ingestion/data` as normalized
JSON arrays. Retrieved sources can
include similarity scores, locations, snippets, and document metadata. If
retrieval or embedding fails, chat continues with the base messages and an empty
`sources` array.

When a request sets `responseMode: "field_assistant"` (or voice chat sends
`X-Response-Mode: field_assistant`), `prompt.builder.js` injects an additional
system message immediately after the base system prompt. Field assistant mode
keeps the final answer voice-friendly, actionable, and no more than two
sentences, prioritizing where to look, what to listen for, and the next
observation to check. This is an opt-in response mode, so the base
`CHAT_SYSTEM_PROMPT_VERSION` does not change for default chat behavior.

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

When a response mode is active, `done.meta.responseMode` is also returned.

## Prompt Evaluation Tracking
Offline prompt and answer evaluation lives under `src/evaluations/`, separate
from runtime prompt assets:
- `datasets/golden-dataset.json` contains 100 representative bird
  identification, tour recommendation, reservation, RAG retrieval, and edge-case
  cases. Each case evaluates expected behavior rather than exact phrasing.
- `scorers/evaluationEngine.scorer.js` returns `score`, `relevance`,
  `grounding`, `correctness`, `completeness`, and `reasoning`.
- `scorers/retrievalQuality.scorer.js` measures retrieved chunk relevance,
  retrieval precision, retrieval recall, and grounding quality.
- `scorers/toolCorrectness.scorer.js` checks required, unexpected, and failed
  tool usage for tool-aware cases.
- `runners/promptRegression.runner.js` compares prompt V1 and V2 by answer
  quality, retrieval quality, latency, token usage, estimated cost, and
  quality-per-dollar.

Prompt regression uses injected executors so tests and CI can run against
mocks, fixtures, staging providers, or recorded responses. Do not store raw
prompt text, raw assistant responses, secrets, PII, or retrieved document
contents in evaluation output.

LangSmith-compatible evaluation reporting lives in
`runners/langSmithEvaluation.runner.js` and dashboard summaries live in
`dashboards/langSmithEvaluation.dashboards.js`. The reporting flow is:
```text
Run
-> Evaluation
-> Score
-> Comparison
```

The dashboard helpers summarize quality trends, regression detection, and
retrieval performance from safe numeric evaluation metadata.

## Change Rules
- Do not place prompt text in controllers or route files.
- Update prompt versions when behavior meaningfully changes.
- Keep prompts Costa Rica-specific unless the product scope changes.
- Keep chat tool instructions aligned with `src/ai/schemas/tour.schema.js`.
- Prefer small prompt edits plus test cases over broad rewrites.

## Prompt History
`docs/development_prompts/` contains generation and implementation notes from earlier AI-assisted work. Treat those files as project history, not runtime prompt assets.
