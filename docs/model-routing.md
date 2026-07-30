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
of fallbacks. The current streaming provider path uses the selected primary
and its established transient retry handling. Automatic cross-model execution
is intentionally deferred because a stream may already have emitted content
before failing; replaying another model could duplicate or contradict output.
The complete compatible chain is available for a future execution abstraction
that can track pre-stream versus post-stream failure safely.

An empty compatible fallback chain fails with
`MODEL_FALLBACK_UNAVAILABLE`. Missing vision capability uses
`VISION_MODEL_UNAVAILABLE`; an evaluation with no independent option uses
`EVALUATION_MODEL_CONFLICT`. Server configuration failures are masked by the
HTTP error middleware.

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
