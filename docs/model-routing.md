# Model Registry And Routing

Back to [Project Context](../CONTEXT.md).

## Responsibilities

`src/ai/routing/modelRegistry.js` is the authoritative source for provider
model IDs and model capabilities. Business services use stable model keys or
call `routeModel`; they do not repeat provider IDs. The registry also owns the
embedding, transcription, and speech model IDs even though those specialized
services are not selected by the generation-task router.

`src/ai/routing/modelPolicies.js` owns the provider-neutral requirements for
each task. A policy declares tier, reasoning effort, latency priority, vision,
structured-output and tool-calling requirements, timeout, and retry limit.
Changing a task policy must not introduce a provider model name.

`src/ai/routing/modelRouter.js` validates inputs, filters incompatible models,
selects one primary, and returns ordered compatible fallbacks. It performs no
network or SDK calls. `taskClassifier.js` maps existing deterministic workflow
signals to a category; a valid explicit task always wins.

## Task Categories

- `intent_classification`
- `general_chat`
- `rag_answer`
- `tour_recommendation`
- `reservation_planning`
- `tool_selection`
- `bird_image_analysis`
- `evaluation`

Unknown categories fail with `MODEL_ROUTING_UNSUPPORTED_TASK`; they are never
treated as general chat.

## Routing Contract

Only `task` is required:

```js
routeModel({
  task: 'reservation_planning',
  estimatedInputTokens: 2200,
  userPlan: 'PRO',
  complexity: 'medium',
  evaluatedModelKey: undefined,
});
```

Defaults are `estimatedInputTokens: 0`, `userPlan: "FREE"`, and
`complexity: "medium"`. Complexity accepts `low`, `medium`, or `high`. Large
inputs and high-complexity general/RAG/recommendation work move to an advanced
policy. Simple FREE-plan chat may use the economy route. Safety-critical task
requirements, such as vision and structural reliability, are never downgraded
for plan or cost.

Chat does not use the zero default. The final generation ContextBuilder
supplies its conservative estimated token count before `routeModel` runs.
Before routing, the special internal `unrouted` key uses the smallest
configured generation-model input limit. A genuinely unknown model identifier
uses the documented 16,000-token fallback. Context budgeting reserves output
headroom and a safety margin before selecting optional items. Output headroom
is task-specific: short general chat reserves less than reservation planning or
bird-image analysis, while the model registry remains the authoritative total
input limit.

The result contains `task`, `route`, `primaryModel`, ordered `fallbackModels`,
`reasoningEffort`, `timeoutMs`, `maxRetries`, `reasonCode`, and `reason`.
Provider model IDs are included for the internal SDK boundary. Admin and other
public projections expose stable model keys instead.

## Fallback And Retry Semantics

Fallbacks pass the same modality, reasoning, structured-output, tool-calling,
evaluation, and input-size constraints as the primary. The router removes the
primary, duplicate keys, and duplicate provider model IDs. Vision routes can
contain only image-capable models. Evaluation excludes both the evaluated key
and its provider model ID when an independent alternative exists.

Fallback ordering is deterministic:

- advanced primary: balanced, economy, then other advanced models;
- balanced primary: other balanced, economy, then advanced models;
- economy primary: other economy, balanced, then advanced models.

`maxRetries` is the retry budget for one selected model; it is not the number
of fallbacks. Final routed generation uses `primaryModel` first, applies that
same-model retry budget, and then visits `fallbackModels` in their returned
order. It never calls the router again, independently selects a model, or
revisits a provider model ID.

The shared OpenAI classifier decides both retry and fallback eligibility.
Transient timeouts, network failures, rate limits, temporary provider
unavailability, and the existing one-time corrective invalid-output category
are eligible. A fallback is considered only after the selected model has no
eligible retry remaining. Cancellation, explicitly non-retryable errors,
authentication/configuration failures, spend or quota exhaustion, safety
refusals, invalid requests, context limits, and tool/business validation
failures stop immediately. The current registry describes OpenAI model routes,
not independently billed providers, so quota or spend-limit failures never
cross-fail over.

`timeoutMs` is one wall-clock deadline for final routed generation. It covers
stream establishment and consumption, every same-model attempt, retry
backoff, and all fallback models. Each provider attempt receives only the
remaining budget. Deadline expiration aborts the active request, prevents any
later attempt, cleans up its timer and abort listener, and produces
`MODEL_ROUTES_EXHAUSTED`.

## Streaming Safety

The provider client temporarily holds the first content chunk. If the stream
fails before another content chunk or clean completion proves the stream can
continue, that buffered content is discarded and an eligible retry or fallback
may start. Once content is passed to the chat streaming pipeline, no retry or
fallback is allowed. A later failure follows the existing safe SSE error path;
output from another model is never appended.

This conservative boundary composes with the chat output-guardrail buffer.
The routed executor treats a successful call to its downstream chunk handler
as output having begun even if a later layer is still buffering, so it can
stop failover earlier but can never combine attempts.

## Tool And Side-Effect Boundary

Planning and `executePlan` finish before routed final generation begins. The
final prompt, including completed tool results, is assembled once and reused
unchanged for every model attempt. Model fallback therefore cannot rerun a
tool plan.

Read-only tools retain classified retry behavior. `createReservation` is
always non-retryable at the tool executor, including when global or per-step
settings request retries. The current reservation write is transactional and
uses a unique confirmation code, but it does not expose the complete stable
idempotency-key and commit-verification contract required to safely repeat an
ambiguous write. A thrown timeout or transport failure is reported as
`TOOL_RESULT_INDETERMINATE` and tells the caller to verify reservation status
before another booking attempt. Confirmation-code collision handling remains
inside the database service path because the failed unique insert did not
commit; it is not an automatic replay of an ambiguous reservation result.

## Attempts, Tracing, And Usage

The original route metadata remains intact. Each provider invocation creates a
child LLM trace under the same agent parent and keeps the request AI trace,
conversation ID, prompt version, experiment assignment, and LangSmith parent
relationship. Safe attempt history records model key, permitted internal
provider ID, primary/fallback role, route position, same-model attempt number,
timing, outcome, classified error code/category, fallback eligibility, output
state, provider request ID, remaining deadline, and available token usage.

Usage is collected as provider usage arrives, including a failed attempt that
reported usage before failing. On success, `selectedModelKey`,
`selectedRoutePosition`, and `usedFallback` identify the serving model without
overwriting the original primary or ordered fallback route. Attempt telemetry
uses the repository sanitizer and contains no prompt, response, PII, secret,
stack trace, or raw provider error. Tracing and telemetry export failures are
best effort and do not fail generation.

When every eligible model is exhausted, the internal error code is
`MODEL_ROUTES_EXHAUSTED`; the exposed retryable message is generic:
“I’m having trouble completing that request right now. Please try again in a
moment.” Terminal client, validation, safety, authorization, and cancellation
errors keep their existing behavior instead of being converted to exhaustion.

An empty compatible fallback chain fails with
`MODEL_FALLBACK_UNAVAILABLE`. Missing vision capability uses
`VISION_MODEL_UNAVAILABLE`; an evaluation with no independent option uses
`EVALUATION_MODEL_CONFLICT`. Server configuration failures are masked by the
HTTP error middleware.

### Canonical execution telemetry

Every call through the routed executor creates one correlation UUID and one
final normalized record, regardless of its retry or fallback count:

```js
{
  requestedTask,
  selectedModel,
  fallbackModel,
  reason,
  latency,
  tokens,
  cost,
  retryCount,
  schemaValidation,
  degradedMode,
  success,
}
```

- `requestedTask` is one of the task categories in this document. It is never
  copied from a user message.
- `selectedModel` is the provider model ID chosen first. `fallbackModel` is the
  final fallback attempted or used, and is `null` when the primary remained
  final. The operational record separately retains the final model and both
  initial/final tiers for aggregation.
- `reason` is the configured routing reason code or a derived bounded
  `FALLBACK_<CATEGORY>` / `FAILED_<CATEGORY>` code. It never contains an
  exception message.
- `latency` is total wall-clock routed-execution time in milliseconds.
- `tokens` is `{ input, output, total }` summed across attempts with reported
  usage. It is `null` when no attempt reports usage.
- `cost` is the sum of configured per-model token estimates. It is `null` when
  usage or pricing needed for the estimate is unavailable.
- `retryCount` counts repeated attempts on the same model after its initial
  attempt. Changing model or tier is a fallback, not a retry.
- `schemaValidation` is `{ success, errorCode }`. `success` is `null` when
  validation is not applicable or unavailable; error codes come from the
  bounded validation-code set. Raw model output and validation values are
  excluded.
- `degradedMode` means the final usable result had reduced capability.
- `success` means the logical execution produced a valid, usable result. It is
  false when retries and fallbacks are exhausted unless the owning
  orchestration produces a truthful deterministic degraded result.

LangSmith receives a detached child run keyed by the same execution UUID. Its
safe output includes every chronological attempt, the initial and final model,
retry/fallback distinction, per-attempt validation, latency, reported tokens,
estimated cost, and the final normalized record. PostHog receives exactly one
idempotent `model_routing_outcome` event with only the execution UUID, task
category, initial routing tier, degraded/user-visible outcome, conversion
outcome, and bounded retry/fallback buckets. The process-local operational
store retains a bounded sanitized record set used by `/admin/overview` to
calculate rates, percentiles, usage/cost, and bounded breakdowns. Prompts,
responses, customer context, tool arguments, raw errors, and PII are excluded
from the PostHog and admin paths.

All three sinks are best effort. LangSmith export is detached; PostHog capture
and operational aggregation are exception-isolated. A sink failure cannot
change or delay the routed result. The finalizer is idempotent, preventing
retry attempts or repeated completion paths from double-counting a logical
execution.

### Architecture evaluation

The paired evaluation runner in
`src/evaluations/runners/modelRoutingEvaluation.runner.js` compares a fixed
single-model arm with the routed arm over identical dataset cases. Execution
order alternates by case, and every case must have exactly one result per arm.
The report measures task success, applicable schema validity, end-to-end
latency, token usage, estimated cost, routed fallback frequency, and
reservation conversion.

The production report command accepts only an attested staging or
production-like result artifact matching
`src/evaluations/datasets/model-routing-results.schema.json`; it does not
silently substitute mocks or fixture-derived values. See `docs/testing.md` for
collection and command details.

## Add, Change, Or Retire A Model

1. Add or update one stable-key entry in `modelRegistry.js`.
2. Declare its service, tier, modalities, reasoning efforts, structured/tool
   support, relative latency/cost, structural reliability, evaluation
   suitability, strengths, and input limit.
3. Configure its provider ID using the environment variables below.
4. Add routing fixtures for every capability the model can satisfy.
5. To retire a model, first configure a compatible replacement, verify preview
   routes and evaluation separation, then remove the old registry entry.

To change a task, edit only its policy unless model capabilities also changed.
Run `__tests__/modelRouter.test.js` and the affected provider/service tests.

## Configuration

`OPENAI_MODEL` remains a backward-compatible alias for the balanced model.
Task-specific variables take precedence:

- `OPENAI_ECONOMY_MODEL`
- `OPENAI_BALANCED_MODEL`
- `OPENAI_ADVANCED_MODEL`
- `OPENAI_STRUCTURED_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_EVALUATION_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_SPEECH_MODEL`

Unspecified advanced, structured, vision, and evaluation entries inherit the
balanced/advanced configuration centrally. Safe repository defaults preserve
the prior `gpt-4o` generation, `text-embedding-3-small` embedding,
`gpt-4o-mini-transcribe` transcription, and `gpt-4o-mini-tts` speech behavior;
the economy default is `gpt-4o-mini`.

Configured replacements must satisfy the capabilities declared by their stable
registry entry. Production configuration must also leave at least two
distinct, compatible provider model IDs for each active generation policy;
aliases that collapse an entire route to one provider ID fail closed because
they cannot provide a real fallback.

## Admin Preview And Security

`POST /admin/model-routing/preview` requires the normal JWT admin middleware.
It validates an allowlisted body and returns only task/tier decisions, stable
model keys, fallback count, reasoning effort, timeout, retry budget, and reason
metadata. It never returns provider IDs, environment values, credentials,
headers, provider errors, prompts, user data, or stack traces.

Routing metadata placed on internal chat orchestration is limited to stable
keys and reason codes for observability. Provider IDs continue to appear only
where existing provider telemetry and cost accounting require the actual
model used.

The provider-name strings intentionally retained in
`src/ai/telemetry/tokenUsage.js` are price lookup keys for historical and
current usage records. They do not select a model and therefore remain
separate from the routing registry.
