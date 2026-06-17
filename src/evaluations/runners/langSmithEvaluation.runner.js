import observabilityService from '../../observability/observability.service.js';
import { evaluateResponse } from '../scorers/evaluationEngine.scorer.js';
import { evaluateRetrievalQuality } from '../scorers/retrievalQuality.scorer.js';
import { evaluateToolCorrectness } from '../scorers/toolCorrectness.scorer.js';
import { average, roundScore } from '../scorers/scoring.utils.js';

const DEFAULT_WEIGHTS = Object.freeze({
  answerQuality: 0.35,
  groundingQuality: 0.25,
  retrievalQuality: 0.25,
  toolCorrectness: 0.15,
});

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

function normalizeRunResult(runResult = {}, startedAt) {
  return {
    answer: runResult.answer || runResult.response || runResult.content || '',
    retrievedChunks: Array.isArray(runResult.retrievedChunks) ? runResult.retrievedChunks : [],
    toolCalls: Array.isArray(runResult.toolCalls)
      ? runResult.toolCalls
      : runResult.toolsCalled || [],
    latencyMs: Number.isFinite(runResult.latencyMs) ? runResult.latencyMs : Date.now() - startedAt,
    costUsd: Number.isFinite(runResult.costUsd) ? runResult.costUsd : Number(runResult.cost || 0),
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

function getExpectedTools(evaluationCase, expectedToolsByCaseId) {
  const configured = expectedToolsByCaseId?.[evaluationCase.id];

  if (Array.isArray(configured)) {
    return configured;
  }

  if (Array.isArray(evaluationCase.expectedTools)) {
    return evaluationCase.expectedTools;
  }

  return [];
}

function calculateCaseScore({
  answerQuality,
  groundingQuality,
  retrievalQuality,
  toolCorrectness,
  weights,
}) {
  return roundScore(
    answerQuality * weights.answerQuality
    + groundingQuality * weights.groundingQuality
    + retrievalQuality * weights.retrievalQuality
    + toolCorrectness * weights.toolCorrectness,
  );
}

async function completeTrace(service, trace, details = {}) {
  trace.end(details);
  await service.completeLangSmithRun?.(trace, details);
}

async function failTrace(service, trace, error) {
  await service.failLangSmithRun?.(trace, error);
  trace.error(error);
}

async function recordScoreTrace({
  service,
  parentTrace,
  name,
  score,
  metadata = {},
}) {
  const trace = parentTrace.child('evaluation_score', name, {
    parentTraceId: parentTrace.id,
    metric: name,
    ...metadata,
  });

  await service.createLangSmithRun?.(trace);
  await completeTrace(service, trace, {
    score,
  });
}

function summarizeVersion(promptVersion, caseResults) {
  const answerQuality = average(caseResults.map((result) => result.answerQuality));
  const groundingQuality = average(caseResults.map((result) => result.groundingQuality));
  const retrievalQuality = average(caseResults.map((result) => result.retrievalQuality));
  const toolCorrectness = average(caseResults.map((result) => result.toolCorrectness));
  const score = average(caseResults.map((result) => result.score));
  const costUsd = caseResults.reduce((total, result) => total + result.costUsd, 0);
  const tokenUsage = caseResults.reduce((totals, result) => ({
    promptTokens: totals.promptTokens + result.tokenUsage.promptTokens,
    completionTokens: totals.completionTokens + result.tokenUsage.completionTokens,
    totalTokens: totals.totalTokens + result.tokenUsage.totalTokens,
  }), {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });
  const costPerCaseUsd = caseResults.length ? costUsd / caseResults.length : 0;
  const qualityPerDollar = costUsd > 0 ? answerQuality / costUsd : null;

  return {
    promptVersion,
    score: roundScore(score),
    answerQuality: roundScore(answerQuality),
    groundingQuality: roundScore(groundingQuality),
    retrievalQuality: roundScore(retrievalQuality),
    toolCorrectness: roundScore(toolCorrectness),
    costUsd: Math.round(costUsd * 1000000) / 1000000,
    costPerCaseUsd: Math.round(costPerCaseUsd * 1000000) / 1000000,
    qualityPerDollar: qualityPerDollar === null
      ? null
      : Math.round(qualityPerDollar * 100) / 100,
    tokenUsage,
    cases: caseResults,
  };
}

function buildComparison(evaluationResults) {
  const versions = Object.values(evaluationResults);
  const winner = versions.reduce((best, current) => (
    !best || current.score > best.score ? current : best
  ), null);

  return {
    winner: winner?.promptVersion,
    scores: Object.fromEntries(
      versions.map((result) => [result.promptVersion, {
        score: result.score,
        answerQuality: result.answerQuality,
        groundingQuality: result.groundingQuality,
        retrievalQuality: result.retrievalQuality,
        toolCorrectness: result.toolCorrectness,
        costUsd: result.costUsd,
        costPerCaseUsd: result.costPerCaseUsd,
        qualityPerDollar: result.qualityPerDollar,
        tokenUsage: result.tokenUsage,
      }]),
    ),
  };
}

export async function runLangSmithEvaluation({
  prompts,
  dataset = [],
  executePrompt,
  expectedRelevantChunksByCaseId = {},
  expectedToolsByCaseId = {},
  options = {},
  service = observabilityService,
} = {}) {
  if (typeof executePrompt !== 'function') {
    throw new TypeError('runLangSmithEvaluation requires an executePrompt function.');
  }

  const promptVersions = normalizePrompts(prompts);
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...options.weights,
  };
  const runTrace = service.startTrace({
    type: 'evaluation_run',
    name: options.name || 'LangSmith evaluation run',
    metadata: {
      promptVersionCount: promptVersions.length,
      caseCount: dataset.length,
      evaluator: 'birdwatching-ai',
    },
  });

  await service.createLangSmithRun?.(runTrace);

  try {
    const evaluation = {};

    for (const promptVersion of promptVersions) {
      const caseResults = [];

      for (const evaluationCase of dataset) {
        const evaluationTrace = runTrace.child('evaluation', 'Evaluation', {
          parentTraceId: runTrace.id,
          promptVersion: promptVersion.id,
          caseId: evaluationCase.id,
          category: evaluationCase.category,
        });

        await service.createLangSmithRun?.(evaluationTrace);

        try {
          const startedAt = Date.now();
          const runResult = normalizeRunResult(await executePrompt({
            prompt: promptVersion.prompt,
            promptVersion: promptVersion.id,
            evaluationCase,
          }), startedAt);
          const groundingText = runResult.retrievedChunks
            .map((chunk) => chunk?.content || chunk?.text || chunk?.body || '')
            .join(' ');
          const answerEvaluation = evaluateResponse(evaluationCase, runResult.answer, {
            groundingText,
          });
          const retrievalEvaluation = evaluateRetrievalQuality({
            question: evaluationCase.question,
            retrievedChunks: runResult.retrievedChunks,
            expectedRelevantChunkIds: getExpectedRelevantChunkIds(
              evaluationCase,
              expectedRelevantChunksByCaseId,
            ),
            answer: runResult.answer,
          });
          const toolEvaluation = evaluateToolCorrectness({
            expectedTools: getExpectedTools(evaluationCase, expectedToolsByCaseId),
            actualTools: runResult.toolCalls,
          });
          const metrics = {
            answerQuality: answerEvaluation.score,
            groundingQuality: retrievalEvaluation.groundingQuality,
            retrievalQuality: retrievalEvaluation.score,
            toolCorrectness: toolEvaluation.score,
          };
          const score = calculateCaseScore({
            ...metrics,
            weights,
          });
          const caseResult = {
            id: evaluationCase.id,
            category: evaluationCase.category,
            score,
            ...metrics,
            latencyMs: runResult.latencyMs,
            costUsd: runResult.costUsd,
            tokenUsage: runResult.tokenUsage,
            reasoning: {
              answerQuality: answerEvaluation.reasoning,
              retrievalQuality: retrievalEvaluation.reasoning,
              toolCorrectness: toolEvaluation.reasoning,
            },
          };

          caseResults.push(caseResult);

          for (const [metric, metricScore] of Object.entries(metrics)) {
            await recordScoreTrace({
              service,
              parentTrace: evaluationTrace,
              name: metric,
              score: metricScore,
              metadata: {
                promptVersion: promptVersion.id,
                caseId: evaluationCase.id,
              },
            });
          }

          await recordScoreTrace({
            service,
            parentTrace: evaluationTrace,
            name: 'score',
            score,
            metadata: {
              promptVersion: promptVersion.id,
              caseId: evaluationCase.id,
            },
          });

          await completeTrace(service, evaluationTrace, {
            score,
            ...metrics,
            retrievedChunkCount: runResult.retrievedChunks.length,
            toolCallCount: runResult.toolCalls.length,
            latencyMs: runResult.latencyMs,
            costUsd: runResult.costUsd,
            tokenUsage: runResult.tokenUsage,
          });
        } catch (error) {
          await failTrace(service, evaluationTrace, error);
          throw error;
        }
      }

      evaluation[promptVersion.id] = summarizeVersion(promptVersion.id, caseResults);
    }

    const comparison = buildComparison(evaluation);
    const comparisonTrace = runTrace.child('evaluation_comparison', 'Comparison', {
      parentTraceId: runTrace.id,
      winner: comparison.winner,
    });

    await service.createLangSmithRun?.(comparisonTrace);
    await completeTrace(service, comparisonTrace, comparison);
    await completeTrace(service, runTrace, {
      winner: comparison.winner,
      scores: comparison.scores,
    });

    return {
      run: {
        id: runTrace.id,
        caseCount: dataset.length,
        promptVersions: promptVersions.map((promptVersion) => promptVersion.id),
      },
      evaluation,
      score: comparison.scores,
      comparison,
    };
  } catch (error) {
    await failTrace(service, runTrace, error);
    throw error;
  }
}

export default runLangSmithEvaluation;
