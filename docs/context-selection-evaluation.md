# Context-selection strategy evaluation

This suite compares three context strategies over identical synthetic source
fixtures without changing production chat behavior:

- `full_history`: every available conversation message plus the fixture's
  default RAG results.
- `last_n`: the most recent six conversation messages plus the same default RAG
  results. `N=6` is configuration and is recorded in every report.
- `dynamic`: the production task budget, relevance-aware conversation
  selection, validated summary, eligible memory, complete RAG selection
  pipeline, tool compaction, and verified structured reservation state.

All strategies receive the same model, prompt version, temperature, seed, and
tool-availability settings. Each run receives a deep clone of the fixture and
there is no response/retrieval cache. Operational reservation arguments are
always derived from the structured state's current version and confirmed values;
message history is never scanned for booking arguments. No evaluation strategy
executes booking or another side-effecting tool.

## Dataset and schemas

The versioned fixtures are in
`src/evaluations/datasets/context-strategy-dataset.json`; their JSON Schema is
`context-strategy-dataset.schema.json` and runtime structural validation is in
`contextStrategyDataset.js`. The report schema is
`context-strategy-report.schema.json`.

Seven cases cover long history and budget pressure, repeated reservation
corrections, explicit clearing and proposed values, conflicting/superseded and
irrelevant memory, duplicate/expired/contradictory RAG, incorrectly scoped
prompt-like retrieval, large tool output, validated summaries, and empty
optional context. Fixtures are synthetic and contain no production customer
data, private traces, or secrets.

Each case supplies conversation/current request, summary, memories with status,
RAG candidates and provenance metadata, default RAG selection, tool results,
structured reservation state/version, expected and prohibited context IDs,
deterministic assertions, a reference answer, and eligible strategies.

## Running the suite

Deterministic CI mode:

```bash
npm run ai:evals:context
```

Override paths or Last-N:

```bash
npm run ai:evals:context -- --last-n 6 --output tmp/context-strategy-eval-results.json
```

Live mode is deliberately separate and requires an explicitly supplied module,
so CI cannot accidentally call a provider:

```bash
npm run ai:evals:context:live -- \
  --executor ./tmp/context-eval-live-executor.mjs \
  --repeats 3 \
  --trace
```

The module exports `executeModel` (or a default function) receiving
`{ messages, operationalState, settings, evaluationCase, strategy, repeat }`.
It returns `{ answer, usage?, latencyMs? }`. It must use the supplied settings,
must not enable side-effecting tools, and should return provider usage when
available. It may also export `judgeModel`, which receives the answer and the
same selected messages and returns normalized `answerRelevance` and
`factualGrounding` scores. Judge scores are labeled `model_judge`; without that
callback the report uses the deterministic fixture scorer. Live runs default to
three repetitions; configure more when the
observed confidence interval is too wide.

## Metrics and aggregation

Deterministic scores check exact selected/prohibited IDs, latest reservation
version/status, booking eligibility, confirmed-only arguments, pending/cleared
values, relevant memory selection, memory false positives/negatives, and RAG
selection. The existing response scorer supplies answer relevance. Factual
grounding combines response grounding and deterministic authorized-RAG
selection. Live executors may produce nondeterministic responses, while the
selection assertions remain deterministic.

Quality metrics report mean, sample/unavailable counts, sample variance, and a
95% normal-approximation confidence interval. Token and latency distributions
report mean, median, p95, total, and sample count. Input usage is `actual` only
when provider prompt usage is returned; otherwise it is `estimated` with the
existing estimator. Input and total costs are estimates from
`src/ai/telemetry/tokenUsage.js`; unknown pricing is unavailable and never zero.

Context failure rate is:

```text
unique case/repeat requests with a context failure
/
eligible unique case/repeat requests
```

Failures remain in per-case and aggregate results under `context_assembly`,
`validation`, `scope`, `freshness`, `compaction`, `budgeting`, or
`missing_reservation_state`. Empty denominators return `unavailable` with null
metrics.

Reports contain per-case results, strategy aggregates, category breakdowns,
quality/token and quality/cost pairs, deltas against full history, material
disagreements with deterministic explanations, and acceptance checks. A result
must not be called better when confidence intervals overlap; fixture mode is a
deterministic selection regression, not evidence about live-model variance.

## Thresholds and privacy

Acceptance thresholds live in `DEFAULT_THRESHOLDS` and may be overridden via
runner configuration. The fixture defaults require no material quality,
reservation, or memory regression; at least 10% input-token reduction; at least
4% estimated-cost reduction; and no more than a two-point context-failure-rate
increase relative to full history.

Local reports retain only content-free selected-item structure, hashes,
synthetic fixture IDs, scores, counts, versions, field names, latency, token,
and cost data. They exclude messages, answers, memory/RAG/tool content, and
reservation values. Optional LangSmith traces use the existing parent/child
evaluation hierarchy and export only case/category/strategy IDs, configuration
hashes, numeric scores, counts, and failure categories. LangSmith failure is
best-effort and cannot change evaluation execution.

No schema migration is required. The evaluation modules are outside the runtime
build artifact, and public API/chat contracts are unchanged.
