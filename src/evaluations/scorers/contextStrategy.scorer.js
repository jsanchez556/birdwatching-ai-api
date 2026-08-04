import { estimateCost } from '../../ai/telemetry/tokenUsage.js';
import { estimateTokens } from '../../ai/context/contextBudget.js';
import { evaluateResponse } from './evaluationEngine.scorer.js';
import { clampScore } from './scoring.utils.js';

const CONTEXT_FAILURE_CATEGORIES = new Set([
  'context_assembly',
  'validation',
  'scope',
  'freshness',
  'compaction',
  'budgeting',
  'missing_reservation_state',
]);

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function classifyEvaluationFailure(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('scope') || code.includes('owner')) return 'scope';
  if (code.includes('fresh') || code.includes('expired') || code.includes('stale')) return 'freshness';
  if (code.includes('compact') || code.includes('summary')) return 'compaction';
  if (code.includes('budget') || code.includes('token')) return 'budgeting';
  if (code.includes('reservation') || code.includes('state')) return 'missing_reservation_state';
  if (code.includes('valid') || code.includes('schema') || code.includes('input')) return 'validation';
  return 'context_assembly';
}

function selectedIds(contextResult, type) {
  return new Set(contextResult.selectedItems
    .filter((item) => !type || item.type === type)
    .map((item) => String(item.id)));
}

function setAccuracy(actual, expected = [], excluded = []) {
  const expectedSet = new Set(expected.map(String));
  const excludedSet = new Set(excluded.map(String));
  const truePositive = [...expectedSet].filter((id) => actual.has(id)).length;
  const falseNegative = expectedSet.size - truePositive;
  const falsePositive = [...actual].filter((id) => excludedSet.has(id)).length;
  const denominator = expectedSet.size + excludedSet.size;
  return {
    score: denominator === 0
      ? 1
      : clampScore((truePositive + (excludedSet.size - falsePositive)) / denominator),
    truePositive,
    falsePositive,
    falseNegative,
  };
}

function scoreReservationState(evaluationCase, contextResult) {
  const expected = evaluationCase.assertions?.reservation || {};
  const actual = contextResult.operationalState;
  if (!evaluationCase.reservationState) {
    return { score: actual === null ? 1 : 0, checks: { absent: actual === null } };
  }
  const expectedArguments = expected.bookingArguments ?? null;
  const checks = {
    version: actual?.version === evaluationCase.reservationState.version,
    status: actual?.status === evaluationCase.reservationState.status,
    bookingEligible: actual?.bookingEligible === Boolean(expected.bookingEligible),
    bookingArguments: JSON.stringify(actual?.bookingArguments ?? null)
      === JSON.stringify(expectedArguments),
    proposedNotOperational: actual?.bookingArguments === null
      || Object.keys(evaluationCase.reservationState.proposed || {})
        .every((field) => !Object.hasOwn(actual.bookingArguments, field)),
  };
  return {
    score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
    checks,
  };
}

function scoreMemory(evaluationCase, contextResult) {
  const actual = selectedIds(contextResult, 'memory');
  const relevant = evaluationCase.assertions?.relevantMemoryIds || [];
  const excluded = evaluationCase.assertions?.excludedMemoryIds || [];
  return setAccuracy(actual, relevant, excluded);
}

function scoreGrounding(evaluationCase, contextResult) {
  const actual = selectedIds(contextResult, 'rag');
  return setAccuracy(
    actual,
    evaluationCase.assertions?.relevantRagChunkIds || [],
    evaluationCase.assertions?.excludedRagChunkIds || [],
  );
}

function scoreContextSelection(evaluationCase, contextResult) {
  return setAccuracy(
    selectedIds(contextResult),
    evaluationCase.expectedRelevantContextIds || [],
    evaluationCase.mustExcludeContextIds || [],
  );
}

function normalizeModelResult(modelResult, contextResult, evaluationCase) {
  const usage = modelResult?.usage || modelResult?.tokenUsage;
  const actualInput = Number(usage?.promptTokens ?? usage?.prompt_tokens ?? usage?.input_tokens);
  const actualOutput = Number(usage?.completionTokens ?? usage?.completion_tokens ?? usage?.output_tokens);
  const inputTokens = Number.isFinite(actualInput)
    ? Math.max(0, Math.floor(actualInput))
    : contextResult.metrics.inputTokens;
  const outputTokens = Number.isFinite(actualOutput)
    ? Math.max(0, Math.floor(actualOutput))
    : estimateTokens(modelResult?.answer || evaluationCase.referenceAnswer || '');
  return {
    answer: modelResult?.answer || evaluationCase.referenceAnswer || '',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenSource: Number.isFinite(actualInput) ? 'actual' : 'estimated',
    endToEndLatencyMs: Number.isFinite(modelResult?.latencyMs)
      ? Math.max(0, modelResult.latencyMs)
      : contextResult.metrics.contextBuildLatency,
  };
}

function normalizeModelJudgeScores(value) {
  if (!value || typeof value !== 'object') return null;
  const answerRelevance = Number(value.answerRelevance);
  const factualGrounding = Number(value.factualGrounding);
  if (!Number.isFinite(answerRelevance) || !Number.isFinite(factualGrounding)) return null;
  return {
    answerRelevance: clampScore(answerRelevance),
    factualGrounding: clampScore(factualGrounding),
  };
}

function scoreContextStrategyRun({ evaluationCase, contextResult, modelResult }) {
  const normalizedModel = normalizeModelResult(modelResult, contextResult, evaluationCase);
  const answer = evaluateResponse({
    question: evaluationCase.currentRequest,
    expectedBehavior: evaluationCase.deterministicAssertions || [],
    evaluationCriteria: evaluationCase.deterministicAssertions || [],
  }, normalizedModel.answer, {
    groundingText: contextResult.selectedItems.map((item) => item.content).join(' '),
  });
  const reservation = scoreReservationState(evaluationCase, contextResult);
  const memory = scoreMemory(evaluationCase, contextResult);
  const grounding = scoreGrounding(evaluationCase, contextResult);
  const contextSelection = scoreContextSelection(evaluationCase, contextResult);
  const modelJudge = normalizeModelJudgeScores(modelResult?.judgeScores);
  const inputCostUsd = estimateCost(evaluationCase.model, {
    promptTokens: normalizedModel.inputTokens,
    completionTokens: 0,
  });
  const totalCostUsd = estimateCost(evaluationCase.model, {
    promptTokens: normalizedModel.inputTokens,
    completionTokens: normalizedModel.outputTokens,
  });
  return {
    answerRelevance: round(modelJudge?.answerRelevance ?? answer.relevance),
    factualGrounding: round(
      modelJudge?.factualGrounding ?? ((answer.grounding + grounding.score) / 2)
    ),
    reservationStateAccuracy: round(reservation.score),
    memoryAccuracy: round(memory.score),
    contextSelectionAccuracy: round(contextSelection.score),
    memoryFalsePositives: memory.falsePositive,
    memoryFalseNegatives: memory.falseNegative,
    inputTokens: normalizedModel.inputTokens,
    outputTokens: normalizedModel.outputTokens,
    totalTokens: normalizedModel.totalTokens,
    inputTokenSource: normalizedModel.inputTokenSource,
    contextBuildLatencyMs: contextResult.metrics.contextBuildLatency,
    endToEndLatencyMs: normalizedModel.endToEndLatencyMs,
    inputCostUsd,
    totalCostUsd,
    costSemantics: 'estimated_from_model_pricing_registry',
    qualityScoreSource: modelJudge ? 'model_judge' : 'deterministic_fixture',
    deterministic: {
      reservation: reservation.checks,
      memory,
      grounding,
      contextSelection,
    },
  };
}

export {
  CONTEXT_FAILURE_CATEGORIES,
  classifyEvaluationFailure,
  normalizeModelResult,
  normalizeModelJudgeScores,
  scoreContextSelection,
  scoreContextStrategyRun,
  scoreGrounding,
  scoreMemory,
  scoreReservationState,
};
