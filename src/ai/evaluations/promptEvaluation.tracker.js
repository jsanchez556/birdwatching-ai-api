import logger from '../../utils/logger.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';

function normalizeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeTokenUsage(usage = {}) {
  return {
    promptTokens: normalizeNumber(usage.promptTokens ?? usage.prompt_tokens),
    completionTokens: normalizeNumber(usage.completionTokens ?? usage.completion_tokens),
    totalTokens: normalizeNumber(
      usage.totalTokens ?? usage.total_tokens,
      normalizeNumber(usage.promptTokens ?? usage.prompt_tokens)
        + normalizeNumber(usage.completionTokens ?? usage.completion_tokens)
    ),
  };
}

function calculateRetrievalQuality(retrieval = {}) {
  const resultCount = normalizeNumber(retrieval.resultCount ?? retrieval.retrievedChunkCount);
  const topK = Math.max(normalizeNumber(retrieval.topK, resultCount || 1), 1);
  const scores = Array.isArray(retrieval.scores)
    ? retrieval.scores.map((score) => normalizeNumber(score)).filter((score) => score > 0)
    : [];
  const averageScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : normalizeNumber(retrieval.averageScore ?? retrieval.similarityScore);
  const coverage = Math.min(resultCount / topK, 1);
  const groundingBonus = retrieval.hasGroundingContext === false ? 0 : 0.1;

  return Number(Math.min((averageScore * 0.7) + (coverage * 0.2) + groundingBonus, 1).toFixed(6));
}

function normalizePromptEvaluation(input = {}) {
  const tokenUsage = normalizeTokenUsage(input.tokenUsage || input.tokens || {});
  const latencyMs = normalizeNumber(input.latencyMs);
  const retrievalQuality = input.retrievalQuality !== undefined
    ? normalizeNumber(input.retrievalQuality)
    : calculateRetrievalQuality(input.retrieval || {});

  return {
    promptVersion: input.promptVersion,
    retrievalQuality,
    tokenUsage,
    latencyMs,
    score: Number((
      retrievalQuality
      - (tokenUsage.totalTokens / 100000)
      - (latencyMs / 100000)
    ).toFixed(6)),
    metadata: input.metadata || {},
  };
}

function comparePromptEvaluations(left = {}, right = {}) {
  const promptV1 = normalizePromptEvaluation(left);
  const promptV2 = normalizePromptEvaluation(right);
  const deltas = {
    retrievalQuality: Number((promptV2.retrievalQuality - promptV1.retrievalQuality).toFixed(6)),
    totalTokens: promptV2.tokenUsage.totalTokens - promptV1.tokenUsage.totalTokens,
    promptTokens: promptV2.tokenUsage.promptTokens - promptV1.tokenUsage.promptTokens,
    completionTokens: promptV2.tokenUsage.completionTokens - promptV1.tokenUsage.completionTokens,
    latencyMs: promptV2.latencyMs - promptV1.latencyMs,
    score: Number((promptV2.score - promptV1.score).toFixed(6)),
  };
  const winner = promptV2.score > promptV1.score
    ? promptV2.promptVersion
    : promptV1.score > promptV2.score
      ? promptV1.promptVersion
      : 'tie';

  return {
    promptV1,
    promptV2,
    deltas,
    winner,
  };
}

class PromptEvaluationTracker {
  constructor({ log = logger, telemetry = aiTelemetry } = {}) {
    this.logger = log;
    this.telemetry = telemetry;
  }

  compare(left, right, metadata = {}) {
    const comparison = comparePromptEvaluations(left, right);

    this.logger.info('Prompt version comparison evaluated', {
      event: 'prompt_version_comparison',
      promptV1: comparison.promptV1.promptVersion,
      promptV2: comparison.promptV2.promptVersion,
      retrievalQualityDelta: comparison.deltas.retrievalQuality,
      totalTokenDelta: comparison.deltas.totalTokens,
      latencyDeltaMs: comparison.deltas.latencyMs,
      winner: comparison.winner,
      metadata,
    });
    this.telemetry.recordAiError('prompt_evaluation_tracked', {
      promptV1: comparison.promptV1.promptVersion,
      promptV2: comparison.promptV2.promptVersion,
      winner: comparison.winner,
      retrievalQualityDelta: comparison.deltas.retrievalQuality,
      totalTokenDelta: comparison.deltas.totalTokens,
      latencyDeltaMs: comparison.deltas.latencyMs,
      metadata,
    });

    return comparison;
  }
}

export {
  calculateRetrievalQuality,
  comparePromptEvaluations,
  PromptEvaluationTracker,
};
