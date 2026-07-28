# Testing

Tests live under `__tests__/` and use Jest with ESM module mocks.

Run the full suite with:

```bash
npm test
```

Run the offline AI evaluation gate with:

```bash
npm run ai:evals
```

AI evaluation helpers live under `src/evaluations/`. Prompt regression checks should compare prompt versions through the evaluation runners instead of hard-coding provider calls in tests. Use injected executors so prompt comparisons can run against mocks, fixtures, staging providers, or recorded responses without leaking prompts, responses, secrets, or PII into production logs.

Focused AI tests belong under `__tests__/ai/`. Keep evaluation engine,
retrieval-quality, prompt-regression, scoring-system, and dashboard tests grouped
there so AI evaluation behavior is easy to run and review.

The AI evaluation runner reads:
- `src/evaluations/datasets/golden-dataset.json` for the 100-case golden dataset
- `src/evaluations/datasets/ai-eval-baseline.json` for baseline score and retrieval quality
- optional CLI/env overrides: `--dataset`, `--baseline`, `--output`, `--results`, `--write-baseline`, `AI_EVAL_DATASET_FILE`, `AI_EVAL_BASELINE_FILE`, `AI_EVAL_OUTPUT_FILE`, and `AI_EVAL_RESULTS_FILE`

The output artifact includes `generatedAt` and retains up to 100 numeric run
snapshots for the admin AI-quality period comparison. Missing scorer fields
remain missing; dashboard aggregation must return `null` with a zero sample
size rather than infer a value.

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

`.github/workflows/ai-evals.yml` runs `npm run ai:evals` on pull requests to
`main` and pushes to `develop`. The workflow fails when aggregate evaluation
score or retrieval quality drops below the checked-in baseline and uploads
`tmp/ai-eval-results.json` as an artifact for review.

Feature-control tests cover admin authorization, current state, audited and
idempotent disable/enable and suspend/unsuspend transitions, protected targets,
UTC expiration, and provider/queue non-execution. Browser errors are asserted
to use `FEATURE_TEMPORARILY_DISABLED` without stacks or provider details.
