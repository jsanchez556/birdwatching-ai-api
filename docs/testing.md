# Testing

Tests live under `__tests__/` and use Jest with ESM module mocks.

Run the full suite with:

```bash
npm test
```

AI evaluation helpers live under `src/evaluations/`. Prompt regression checks should compare prompt versions through the evaluation runners instead of hard-coding provider calls in tests. Use injected executors so prompt comparisons can run against mocks, fixtures, staging providers, or recorded responses without leaking prompts, responses, secrets, or PII into production logs.

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
