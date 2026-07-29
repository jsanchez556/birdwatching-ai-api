import { evaluateResponse } from '../scorers/evaluationEngine.scorer.js';
import { evaluateRetrievalQuality } from '../scorers/retrievalQuality.scorer.js';
import { average, clampScore, roundScore } from '../scorers/scoring.utils.js';

const DEFAULT_WEIGHTS = Object.freeze({
  quality: 0.5,
  retrievalQuality: 0.25,
  latency: 0.15,
  cost: 0.1,
});

const DEFAULT_MAX_LATENCY_MS = 8000;
const DEFAULT_MAX_COST_USD = 0.05;

function normalizeTokenUsage(runResult = {}) {
  const usage = runResult.tokenUsage || runResult.usage || {};
  const promptTokens = Number(
    usage.promptTokens
    ?? usage.prompt_tokens
    ?? usage.inputTokens
    ?? usage.input_tokens
    ?? runResult.promptTokens
    ?? 0,
  );
  const completionTokens = Number(
    usage.completionTokens
    ?? usage.completion_tokens
    ?? usage.outputTokens
    ?? usage.output_tokens
    ?? runResult.completionTokens
    ?? 0,
  );
  const totalTokens = Number(
    usage.totalTokens
    ?? usage.total_tokens
    ?? runResult.totalTokens
    ?? promptTokens + completionTokens,
  );

  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function normalizePrompts(prompts) {
  if (Array.isArray(prompts)) {
    return prompts.map((prompt, index) => ({
      id: prompt.id || prompt.version || `v${index + 1}`,
      prompt: prompt.prompt || prompt.content || prompt,
    }));
  }

  return Object.entries(prompts || {}).map(([id, prompt]) => ({
    id,
    prompt: prompt?.prompt || prompt?.content || prompt,
  }));
}

function normalizeRunResult(runResult, startedAt) {
  const latencyMs = Number.isFinite(runResult?.latencyMs)
    ? runResult.latencyMs
    : Date.now() - startedAt;
  const costUsd = Number.isFinite(runResult?.costUsd)
    ? runResult.costUsd
    : Number(runResult?.cost || 0);

  return {
    answer: runResult?.answer || runResult?.response || runResult?.content || '',
    retrievedChunks: Array.isArray(runResult?.retrievedChunks) ? runResult.retrievedChunks : [],
    latencyMs,
    costUsd: Number.isFinite(costUsd) ? costUsd : 0,
    tokenUsage: normalizeTokenUsage(runResult),
  };
}

function getExpectedRelevantChunkIds(evaluationCase, expectedRelevantChunksByCaseId) {
  const configured = expectedRelevantChunksByCaseId?.[evaluationCase.id];

  if (Array.isArray(configured)) {
    return configured;
  }

  if (Array.isArray(evaluationCase.expectedRelevantChunkIds)) {
    return evaluationCase.expectedRelevantChunkIds;
  }

  return [];
}

function summarizePromptVersion({
  id,
  prompt,
  results,
  weights,
  maxLatencyMs,
  maxCostUsd,
}) {
  const quality = average(results.map((result) => result.quality.score));
  const retrievalQuality = average(results.map((result) => result.retrieval.score));
  const latencyMs = average(results.map((result) => result.latencyMs));
  const costUsd = results.reduce((total, result) => total + result.costUsd, 0);
  const tokenUsage = results.reduce((totals, result) => ({
    promptTokens: totals.promptTokens + result.tokenUsage.promptTokens,
    completionTokens: totals.completionTokens + result.tokenUsage.completionTokens,
    totalTokens: totals.totalTokens + result.tokenUsage.totalTokens,
  }), {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });
  const latency = clampScore(1 - (latencyMs / maxLatencyMs));
  const cost = clampScore(1 - (costUsd / maxCostUsd));
  const costPerCaseUsd = results.length ? costUsd / results.length : 0;
  const costPerQualityPoint = quality > 0 ? costUsd / quality : 0;
  const qualityPerDollar = costUsd > 0 ? quality / costUsd : null;
  const score = (
    quality * weights.quality
    + retrievalQuality * weights.retrievalQuality
    + latency * weights.latency
    + cost * weights.cost
  );

  return {
    promptVersion: id,
    prompt,
    score: roundScore(score),
    quality: roundScore(quality),
    latency: roundScore(latency),
    latencyMs: Math.round(latencyMs),
    cost: roundScore(cost),
    costUsd: Math.round(costUsd * 1000000) / 1000000,
    costPerCaseUsd: Math.round(costPerCaseUsd * 1000000) / 1000000,
    costPerQualityPoint: Math.round(costPerQualityPoint * 1000000) / 1000000,
    qualityPerDollar: qualityPerDollar === null
      ? null
      : Math.round(qualityPerDollar * 100) / 100,
    tokenUsage,
    retrievalQuality: roundScore(retrievalQuality),
    cases: results,
  };
}

function buildPromptComparison(comparison) {
  const versions = Object.values(comparison);
  const bestQuality = versions.reduce((best, current) => (
    !best || current.quality > best.quality ? current : best
  ), null);
  const lowestCost = versions.reduce((best, current) => (
    !best || current.costUsd < best.costUsd ? current : best
  ), null);
  const mostCostEfficient = versions.reduce((best, current) => {
    if (current.qualityPerDollar === null) return best;
    if (!best || current.qualityPerDollar > best.qualityPerDollar) return current;
    return best;
  }, null);

  return {
    bestQuality: bestQuality?.promptVersion,
    lowestCost: lowestCost?.promptVersion,
    mostCostEfficient: mostCostEfficient?.promptVersion,
    versions: Object.fromEntries(versions.map((version) => [
      version.promptVersion,
      {
        quality: version.quality,
        costUsd: version.costUsd,
        costPerCaseUsd: version.costPerCaseUsd,
        qualityPerDollar: version.qualityPerDollar,
        tokenUsage: version.tokenUsage,
      },
    ])),
  };
}

export async function runPromptRegression({
  prompts,
  dataset = [],
  executePrompt,
  expectedRelevantChunksByCaseId = {},
  options = {},
} = {}) {
  if (typeof executePrompt !== 'function') {
    throw new TypeError('runPromptRegression requires an executePrompt function.');
  }

  const promptVersions = normalizePrompts(prompts);
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...options.weights,
  };
  const maxLatencyMs = options.maxLatencyMs || DEFAULT_MAX_LATENCY_MS;
  const maxCostUsd = options.maxCostUsd || DEFAULT_MAX_COST_USD;
  const comparison = {};

  for (const promptVersion of promptVersions) {
    const caseResults = [];

    for (const evaluationCase of dataset) {
      const startedAt = Date.now();
      const rawRunResult = await executePrompt({
        prompt: promptVersion.prompt,
        promptVersion: promptVersion.id,
        evaluationCase,
      });
      const runResult = normalizeRunResult(rawRunResult, startedAt);
      const quality = evaluateResponse(evaluationCase, runResult.answer, {
        groundingText: runResult.retrievedChunks
          .map((chunk) => chunk?.content || chunk?.text || chunk?.body || '')
          .join(' '),
      });
      const retrieval = evaluateRetrievalQuality({
        question: evaluationCase.question,
        retrievedChunks: runResult.retrievedChunks,
        expectedRelevantChunkIds: getExpectedRelevantChunkIds(
          evaluationCase,
          expectedRelevantChunksByCaseId,
        ),
        answer: runResult.answer,
      });

      caseResults.push({
        id: evaluationCase.id,
        category: evaluationCase.category,
        question: evaluationCase.question,
        quality,
        retrieval,
        latencyMs: runResult.latencyMs,
        costUsd: runResult.costUsd,
        tokenUsage: runResult.tokenUsage,
      });
    }

    comparison[promptVersion.id] = summarizePromptVersion({
      id: promptVersion.id,
      prompt: promptVersion.prompt,
      results: caseResults,
      weights,
      maxLatencyMs,
      maxCostUsd,
    });
  }

  return {
    ...comparison,
    comparison: buildPromptComparison(comparison),
  };
}

export default runPromptRegression;
