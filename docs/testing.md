# Testing

Tests live under `__tests__/` and use Jest with ESM module mocks.

Run the full suite with:

```bash
npm test
```

Run the cross-repository streamed `/chat` contract smoke test with both
repositories checked out as siblings:

```bash
node ../birdwatching-ai-ui/scripts/test-chat-contract.js --api-root .
```

The UI owns the canonical runner because it is the consumer at this
cross-repository boundary. The runner emits `start`, `chunk`, and `done` events
through the same helpers used by the production API controller, then passes
those exact bytes to the UI's production stream consumer. It asserts
progressive assistant content, the normalized conversation ID, and unchanged
reservation/UI-action metadata. It uses no application services, providers,
databases, Redis, network, credentials, or independently duplicated wire
fixtures.

Both repositories' pull-request workflows invoke this one runner against the
other repository's `main` branch. Cross-repository checkout therefore assumes
the repositories are public, or that the workflow token is granted read access
to the other repository.

Run the synthetic scorer self-test with:

```bash
npm run ai:evals:self-test
```

This test deliberately assembles answers and chunks from dataset labels. It
validates deterministic scorer behavior only and is never model, RAG, agent, or
production-quality evidence.

Run the portfolio regression gate only with a sanitized artifact captured from
the actual application pipeline:

```bash
npm run ai:evals -- --results path/to/real-pipeline-output-v1.json
```

`npm run ai:evals:portfolio` is an explicit alias. For backward compatibility,
`npm run ai:evals` remains the portfolio command, but its old synthetic fallback
was removed. It fails when `--results`/`AI_EVAL_RESULTS_FILE` is absent.

AI evaluation helpers live under `src/evaluations/`. Prompt regression checks should compare prompt versions through the evaluation runners instead of hard-coding provider calls in tests. Use injected executors so prompt comparisons can run against mocks, fixtures, staging providers, or recorded responses without leaking prompts, responses, secrets, or PII into production logs.

Focused AI tests belong under `__tests__/ai/`. Keep evaluation engine,
retrieval-quality, prompt-regression, scoring-system, and dashboard tests grouped
there so AI evaluation behavior is easy to run and review.

The portfolio evaluation runner reads:
- `src/evaluations/datasets/golden-dataset.json` for the 100-case golden dataset
- `src/evaluations/datasets/ai-eval-baseline.json` for honest portfolio threshold and provenance metadata
- `src/evaluations/datasets/real-output-artifact.schema.json` for the versioned input contract
- optional CLI/env overrides: `--dataset`, `--baseline`, `--output`, `--results`, `--write-baseline`, `AI_EVAL_DATASET_FILE`, `AI_EVAL_BASELINE_FILE`, `AI_EVAL_OUTPUT_FILE`, and `AI_EVAL_RESULTS_FILE`

The real-output artifact must identify every dataset case and contain the actual
assistant response or explicit error, explicit retrieval status and actual
chunks when evaluated, and tool/agent outcome when relevant. Provenance must
attest `generatedByActualPipeline: true` and
`labelsPresentedToPipeline: false`. Generate it by running the golden questions
through staging or a production-like deployment without including expected
behavior or evaluation criteria in requests; capture the final response,
retrieval IDs/content, tool outcome, and errors; redact private data; have a
reviewer label relevant chunk IDs; then validate and run the command above.
Never hand-author model responses as a substitute for this collection step.

The output contains aggregate and category metrics, threshold violations,
representative failures, explicit retrieval counts, `generatedAt`, and up to
100 run snapshots. `not_applicable` retrieval is excluded from retrieval
averages; `missing` is reported and fails its case. Dashboard aggregation
returns `null` with zero samples unless an artifact is explicitly marked as
valid real-pipeline evidence.

Admin AI-quality tests cover authorization, normalized routing, shared range
validation, equal-duration previous periods, mixed/missing score aggregation,
evaluated-tool execution ratios, empty periods, null-safe deltas, local artifact
reads, and the absence of an evaluator/provider dependency in the request path.

Safe admin-operation tests cover missing authentication, non-admin rejection,
successful admin routing, validator rejection, audit-before-mutation behavior,
failed-only BullMQ retry checks, safe audit metadata, suspension and refresh
revocation orchestration, current-token suspension enforcement, temporary
feature override precedence and expiry behavior, and fail-closed feature-control
lookup errors. Query tests assert parameterized calls and ensure the retry read
selects only safe job identity and state fields. Migration regression coverage
also verifies that the feature-control upsert targets its named primary-key
constraint instead of the ambiguous `feature` identifier.

Prompt regression results should compare:

- answer quality
- latency
- cost
- token usage
- retrieval quality
- prompt quality versus prompt cost

The expected summary shape is:

```js
{
  v1: {
    score: 0.84,
    quality: 0.86,
    costUsd: 0.012,
    tokenUsage: {
      promptTokens: 1200,
      completionTokens: 450,
      totalTokens: 1650,
    },
  },
  v2: {
    score: 0.92,
    quality: 0.94,
    costUsd: 0.01,
    tokenUsage: {
      promptTokens: 1100,
      completionTokens: 420,
      totalTokens: 1520,
    },
  },
  comparison: {
    bestQuality: 'v2',
    lowestCost: 'v2',
    mostCostEfficient: 'v2',
  },
}
```

LangSmith evaluation integration uses the evaluation runner flow:

```text
Run
-> Evaluation
-> Score
-> Comparison
```

LangSmith evaluation traces track:

- answer quality
- grounding quality
- retrieval quality
- tool correctness
- token usage
- cost

LangSmith evaluation dashboard helpers expose three dashboard views:

- Quality Trends: score, answer quality, grounding quality, and tool correctness over time
- Regression Detection: score, answer quality, and retrieval quality drops versus previous runs or baselines
- Retrieval Performance: retrieval quality, retrieval precision, retrieval recall, and grounding quality by category

Keep LangSmith evaluation metadata safe: use case IDs, categories, prompt
version IDs, score numbers, counts, latency, token usage, and cost. Do not
export raw prompts, raw model responses, secrets, PII, or retrieved document
contents as production trace metadata.

`.github/workflows/ai-evals.yml` runs the scorer self-test and then requires the
repository variable `AI_EVAL_RESULTS_FILE` to name a checked-out, sanitized
staging/production-like artifact. It fails closed when the variable or file is
missing and uploads the two result types separately.

### Evaluation provenance and baseline regeneration

The portfolio baseline records dataset purpose/source, collection and labeling
method, reviewer process, model, prompt, retrieval/index, evaluator/scoring
versions, sample/category counts, limitations, and regeneration conditions.
Unavailable historical values are the literal string `unknown`; they must not
be inferred. Supply them from the reviewed collection run. Regenerate with
`--write-baseline` after model/prompt/index/tool/dataset/evaluator changes, or
when the fixture no longer represents the intended staging environment.

The previous `0.9839`/`0.9796` values moved to
`scorer-self-test-baseline.json`. Migration summary: old `ai:evals` synthetic
behavior is now `ai:evals:self-test`; `ai:evals`/`ai:evals:portfolio` are the
real-output gate; the default dashboard artifact remains
`tmp/ai-eval-results.json`, while self-test output is
`tmp/ai-scorer-self-test-results.json`.

Feature-control tests cover admin authorization, current state, audited and
idempotent disable/enable and suspend/unsuspend transitions, protected targets,
UTC expiration, and provider/queue non-execution. Browser errors are asserted
to use `FEATURE_TEMPORARILY_DISABLED` without stacks or provider details.
