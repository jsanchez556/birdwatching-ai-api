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
- Reservation-intent prompt and strict Structured Outputs schema:
  `src/ai/prompts/reservationIntent.prompt.js` and
  `src/ai/schemas/reservationIntent.schema.js`
- Conversation-compaction prompt and strict Structured Outputs schema:
  `src/ai/prompts/conversationSummary.prompt.js` and
  `src/ai/schemas/conversationSummary.schema.js`
- Durable-user-memory extraction prompt and strict Structured Outputs schema:
  `src/ai/prompts/userMemory.prompt.js` and
  `src/ai/schemas/userMemory.schema.js`

Prompt modules export both content and a semantic prompt version. Keep version changes intentional and loggable.

Chat prompt version `3.0.0` uses Transfer as the canonical service term and
aligns the `calculateTransfer` tool, transfer UI actions, and transfer booking
metadata with the public API contract. It retains discovery across the
maintained Birdwatching, Day walk, Night walk, Day & Night Walk, Adventure,
Excursion, Transfer, and Other categories and requires reservation intake to request every
currently missing field in one turn. Known values from customer context,
conversation context, and durable proposed or confirmed reservation state are
not requested again; follow-up questions are reserved for missing, invalid,
unavailable, or ambiguous responses.

User memory prompt version `1.1.0` permits only explicit, stable, safe,
cross-session information in six allowlisted categories. Model output remains
untrusted: service validation enforces confidence, safety, editability, lexical
support, expiration, duplicates, and same-category/semantic-axis conflict rules
before writes. Explicit corrections and uncertain conflicts are separate schema
states; uncertain conflicts require clarification and cannot supersede data.

Reservation intent prompt version `3.1.0` uses the canonical `transferRequired`
field and transfer terminology. It retains `clearedFields` so an explicit user
request to remove a prior value is distinct from an unstated value. Corrections
contain the latest value only. The model never confirms operational state:
normalized extraction becomes proposed structured state, and the deterministic
application transition owns promotion.

Conversation summary prompt version `1.1.0` preserves transfer choices using
the canonical product terminology.

Tour recommendation response framing has two versioned prompt assets in
`src/ai/prompts/tourRecommendation.prompt.js`. The
`tour_recommendation_prompt` feature flag selects
`recommendation_prompt_v1` or `recommendation_prompt_v2` when the planner emits
a recommendation-mode `searchTours` step. The selected prompt is injected only
for that final response and is recorded in LangSmith metadata.

## Bird Identification Prompt Flow
Bird identification uses three model-facing stages, all returning JSON through strict response schemas:

1. `birdImageAnalysis.service.js` uses `BIRD_IMAGE_ANALYSIS_SYSTEM_PROMPT` to extract rich visible evidence only: dominant plumage colors, field marks, bill color/shape/length, head/throat/upperpart/underpart/tail/wing details, apparent group, habitat hints when visible, image quality, and visual-analysis confidence. It must not guess species, exact location, photographer details, season, behavior, or hidden context.
2. `birdIdentification.agent.js` uses `BIRD_CANDIDATE_GENERATION_SYSTEM_PROMPT` to generate 0-5 conservative candidates from the visual evidence and, when available, the provider-readable image URL. Candidates include `commonName`, optional `scientificName`, confidence, reasoning, visible evidence, possible confusions, and missing evidence. Weak evidence should return multiple candidates or `unknown`, not a forced species.
3. `birdIdentification.agent.js` uses `BIRD_IDENTIFICATION_VERIFICATION_SYSTEM_PROMPT` to compare candidates against retrieved bird-profile RAG, preserve visual evidence as primary, add `ragSupport`, note contradictions/missing evidence, rerank, and calibrate final confidence.

Candidate and verification schemas require non-empty candidate names,
reasoning, and visible evidence. An `unknown` result uses an empty candidate
array (and `bestMatch: null` during verification) rather than a placeholder
candidate. Verification may only rerank the supplied candidates and must
preserve their common and scientific names so service-level evidence merging
remains deterministic.

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

`src/ai/context/contextBuilder.js` is the canonical runtime selection boundary
around these messages. It converts candidate messages into typed context
items, applies deterministic deduplication and category/total token budgets,
retains provenance without raw content, and returns privacy-safe metrics. Every
candidate records source type/ID, retrieval time, trust, expiration and current
validity, original-content SHA-256, transformations, and selection outcome.
Expired or malformed-expiration candidates are rejected rather than promoted by
required-item priority.
`contextFormatter.js` converts the selected provider-neutral package back into
role messages at the AI boundary. It preserves provenance between assembly
stages in non-enumerable sidecars that are not included in provider JSON.

Assembly occurs twice:

1. a planning package is built after conversation and RAG assembly;
2. a generation package is built after ordered tool execution.

The second package is reused for every same-model retry and cross-model
fallback. Tool execution is never replayed. Retrieved knowledge, memories,
application state, and tool output are explicitly delimited as data rather
than executable instructions. Security/platform instructions and the current
request are required items; an impossible mandatory budget fails before the
provider call.

Long conversations are compacted before ContextBuilder selection. The
versioned structured summary replaces only older exchanges; configured recent
exchanges remain byte-for-byte unchanged and are protected during selection.
The summary is cumulative and contains typed goals, sourced facts,
preferences, decisions, unresolved questions, pending actions, and its
previous version. Structured output refusal, invalid sources, version mismatch,
or schema failure never produces an unstructured fallback summary.

## Context Budget Policies

`src/ai/context/contextBudget.js` exports the configurable task policy map.
Each allocation is a fraction of the effective input capacity after the
task-specific output reservation and fixed safety margin are removed:

| Task | Recent conversation | Long-term memory | Retrieved knowledge | Tool results | Application state | Output reserve |
|---|---:|---:|---:|---:|---:|---:|
| `general_chat` | 45% | 15% | 15% | 5% | 5% | 1,500 |
| `rag_answer` | 20% | 10% | 50% | 10% | 5% | 2,000 |
| `tour_recommendation` | 20% | 10% | 25% | 30% | 10% | 2,000 |
| `reservation_planning` | 20% | 5% | 15% | 40% | 15% | 2,500 |
| `tool_selection` | 25% | 5% | 10% | 40% | 15% | 2,000 |
| `bird_image_analysis` | 10% | 5% | 60% | 5% | 5% | 2,500 |

Allocations are soft targets. A category may borrow a bounded 25% above its
target when capacity remains, but it can never exceed the total effective
input budget. Required platform/security instructions and the current user
message bypass optional-category eviction and are checked against the total
budget first. Optional selection remains deterministic and favors relevance,
recency, trust, then stable IDs.

Assembly metrics report discarded item and estimated-token totals by category
and reason. They remain aggregate-only and contain no prompt, memory, RAG, or
tool content.

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

Pgvector candidates are not prompt-ready. The RAG selection pipeline filters
metadata and document permissions, removes near-duplicates without collapsing
opposite-polarity claims, reranks for the current query with verified/current
source preference, detects contradictions, performs extractive compression,
and applies a 900-token default RAG payload cap before ContextBuilder's broader
model-aware budget. The prompt labels each selected passage `[R1]`, `[R2]`, and
so on and instructs the model to cite those identifiers. Contradiction warnings
require qualified uncertainty unless verified/current evidence resolves them.

Large tool outputs are also not prompt-ready. Tool results above eight list
items or roughly 600 estimated tokens are stored outside the prompt and replaced
with a compact projection containing identifiers needed for later actions,
relevant display fields, total and pagination metadata, at most five selected
rows, an omitted-row count, and an opaque result reference. Internal margins,
supplier/database fields, credentials, raw provider data, query diagnostics,
and stack information are excluded. A storage failure never causes the raw
result to be inserted into model context.

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
so availability, transfer, pricing, and reservation steps cannot race each
other in one model turn.

Before any tour, transfer, availability, pricing, or reservation tool
executes, `reservationIntent.service.js` uses the OpenAI SDK Structured Outputs
parser with the strict Zod reservation-intent schema. Refusals, absent parsed
output, schema failures, inconsistent missing-field markers, and unknown intent
produce a no-tool clarification plan. Extracted nulls remain explicit, including
the distinction between an unstated transfer preference and `false`.
Structured extraction does not validate tour existence, dates, capacity,
authorization, transfer rules, pricing, or discounts; the existing
backend services and database remain authoritative for those rules.

Tour discovery should happen before booking: use `searchTours` to return three
ranked eligible tours whenever possible, clearly mark weaker alternatives, and
ask the user to select a specific tour by ID or exact normalized name. After
selection, require an explicit backend-validated date, then check availability,
estimate transfer when requested, price, and create the reservation.
Bird-information questions are answered directly and never inherit an earlier
booking intent merely because the conversation already contains a selected tour.
An authenticated `featured_tour` reservation entry is an explicit structured
selection: even if message-only extraction labels its initial sentence as a
recommendation request, planning must use that exact tour, skip `searchTours`,
and proceed only through missing date/details and authoritative availability.

Recommendation-mode tool results are assembled and Zod-validated at the
application boundary as `done.meta.tourRecommendation`. Tour identifiers,
price, availability, reasons, and normalized confidence come only from the
database-backed `searchTours` result; the final model response supplies the
short `summary` text but is never scraped for card fields.

Pricing supports optional discount codes and group discounts. Reservation
creation requires participant count and customer name, and can resolve the tour
from ID, clear tour name, or location. Customer name, email, and itinerary dates
should come from frontend `customerContext` when present.

Reservation tool results include durable confirmation fields and optional
frontend-safe transfer and itinerary metadata. The final assistant response
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
    "chat": "2.4.0"
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
