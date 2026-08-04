import observabilityService from '../../observability/observability.service.js';
import { createStableHash } from '../../utils/hash.utils.js';
import {
  CONTEXT_STRATEGIES,
  DEFAULT_LAST_N,
  STRATEGY_CONFIGURATION_VERSION,
  buildContextForStrategy,
  contentFreeSelection,
} from '../strategies/contextSelection.strategies.js';
import {
  classifyEvaluationFailure,
  scoreContextStrategyRun,
} from '../scorers/contextStrategy.scorer.js';

const DEFAULT_STRATEGIES = Object.freeze(Object.values(CONTEXT_STRATEGIES));
const DEFAULT_THRESHOLDS = Object.freeze({
  minimumAnswerRelevanceDelta: -0.03,
  minimumFactualGroundingDelta: -0.03,
  minimumReservationAccuracyDelta: 0,
  minimumMemoryAccuracyDelta: 0,
  minimumInputTokenReduction: 0.1,
  minimumEstimatedCostReduction: 0.04,
  maximumContextFailureRateIncrease: 0.02,
  materialDisagreementDelta: 0.1,
});

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function distribution(values) {
  if (!values.length) {
    return { status: 'unavailable', mean: null, median: null, p95: null, total: null, sampleCount: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    status: 'available',
    mean: round(total / values.length, 6),
    median: round(percentile(values, 0.5), 6),
    p95: round(percentile(values, 0.95), 6),
    total: round(total, 6),
    sampleCount: values.length,
  };
}

function qualityMetric(results, field) {
  const values = results.map((result) => result.scores?.[field]).filter(Number.isFinite);
  if (!values.length) {
    return {
      status: 'unavailable', mean: null, sampleCount: 0,
      unavailableCount: results.length, variance: null, confidenceInterval95: null,
    };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
    : 0;
  const margin = values.length > 1 ? 1.96 * Math.sqrt(variance / values.length) : 0;
  return {
    status: 'available',
    mean: round(mean),
    sampleCount: values.length,
    unavailableCount: results.length - values.length,
    variance: round(variance, 6),
    confidenceInterval95: [round(Math.max(0, mean - margin)), round(Math.min(1, mean + margin))],
  };
}

function failureMetric(results) {
  if (!results.length) return { status: 'unavailable', numerator: null, denominator: 0, rate: null };
  const failedRequests = new Set(results.filter((result) => result.failureCategory)
    .map((result) => `${result.caseId}:${result.repeat}`));
  const eligibleRequests = new Set(results.map((result) => `${result.caseId}:${result.repeat}`));
  return {
    status: 'available',
    numerator: failedRequests.size,
    denominator: eligibleRequests.size,
    rate: round(failedRequests.size / eligibleRequests.size),
  };
}

function aggregateStrategy(strategy, results) {
  const successful = results.filter((result) => !result.failureCategory && result.scores);
  const priced = successful.filter((result) => result.scores.totalCostUsd !== null);
  return {
    strategy,
    requestCount: results.length,
    successfulRequestCount: successful.length,
    answerRelevance: qualityMetric(results, 'answerRelevance'),
    factualGrounding: qualityMetric(results, 'factualGrounding'),
    reservationStateAccuracy: qualityMetric(results, 'reservationStateAccuracy'),
    memoryAccuracy: qualityMetric(results, 'memoryAccuracy'),
    contextSelectionAccuracy: qualityMetric(results, 'contextSelectionAccuracy'),
    memoryUse: {
      falsePositives: successful.reduce((sum, result) => sum + result.scores.memoryFalsePositives, 0),
      falseNegatives: successful.reduce((sum, result) => sum + result.scores.memoryFalseNegatives, 0),
    },
    inputTokens: distribution(successful.map((result) => result.scores.inputTokens)),
    tokenSemantics: {
      actual: successful.filter((result) => result.scores.inputTokenSource === 'actual').length,
      estimated: successful.filter((result) => result.scores.inputTokenSource === 'estimated').length,
    },
    latency: {
      contextBuildMs: distribution(successful.map((result) => result.scores.contextBuildLatencyMs)),
      endToEndMs: distribution(successful.map((result) => result.scores.endToEndLatencyMs)),
    },
    estimatedCost: {
      input: distribution(priced.map((result) => result.scores.inputCostUsd)),
      total: distribution(priced.map((result) => result.scores.totalCostUsd)),
      pricedRequestCount: priced.length,
      unpricedRequestCount: successful.length - priced.length,
      semantics: 'estimated_from_model_pricing_registry',
    },
    contextFailureRate: failureMetric(results),
  };
}

function aggregateByCategory(results, strategies) {
  const categories = [...new Set(results.map((result) => result.category))].sort();
  return Object.fromEntries(categories.map((category) => [
    category,
    Object.fromEntries(strategies.map((strategy) => [
      strategy,
      aggregateStrategy(strategy, results.filter((result) => (
        result.category === category && result.strategy === strategy
      ))),
    ])),
  ]));
}

function regressionDeltas(aggregates, baseline = CONTEXT_STRATEGIES.FULL_HISTORY) {
  const baselineMetrics = aggregates[baseline];
  return Object.fromEntries(Object.entries(aggregates).map(([strategy, metrics]) => [strategy, {
    answerRelevance: round(metrics.answerRelevance.mean - baselineMetrics.answerRelevance.mean),
    factualGrounding: round(metrics.factualGrounding.mean - baselineMetrics.factualGrounding.mean),
    reservationStateAccuracy: round(
      metrics.reservationStateAccuracy.mean - baselineMetrics.reservationStateAccuracy.mean
    ),
    memoryAccuracy: round(metrics.memoryAccuracy.mean - baselineMetrics.memoryAccuracy.mean),
    inputTokenReduction: baselineMetrics.inputTokens.mean
      ? round(1 - (metrics.inputTokens.mean / baselineMetrics.inputTokens.mean)) : null,
    estimatedCostReduction: baselineMetrics.estimatedCost.total.mean
      ? round(1 - (metrics.estimatedCost.total.mean / baselineMetrics.estimatedCost.total.mean)) : null,
    contextFailureRate: round(
      metrics.contextFailureRate.rate - baselineMetrics.contextFailureRate.rate
    ),
  }]));
}

function findDisagreements(results, threshold) {
  const groups = new Map();
  for (const result of results.filter((entry) => entry.scores)) {
    const key = `${result.caseId}:${result.repeat}`;
    const group = groups.get(key) || [];
    group.push(result);
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const values = group.map((result) => result.scores.contextSelectionAccuracy);
    if (Math.max(...values) - Math.min(...values) < threshold) return [];
    const best = [...group].sort((left, right) => (
      right.scores.contextSelectionAccuracy - left.scores.contextSelectionAccuracy
    ))[0];
    const worst = [...group].sort((left, right) => (
      left.scores.contextSelectionAccuracy - right.scores.contextSelectionAccuracy
    ))[0];
    return [{
      caseId: key.split(':')[0],
      strategies: group.map((entry) => entry.strategy),
      selectionAccuracyRange: [
        round(worst.scores.contextSelectionAccuracy),
        round(best.scores.contextSelectionAccuracy),
      ],
      explanation: [
        `${best.strategy} selected more expected context and/or excluded more prohibited context than ${worst.strategy}.`,
        `Expected-context misses: ${best.scores.deterministic.contextSelection.falseNegative} versus ${worst.scores.deterministic.contextSelection.falseNegative}.`,
        `Prohibited selections: ${best.scores.deterministic.contextSelection.falsePositive} versus ${worst.scores.deterministic.contextSelection.falsePositive}.`,
      ].join(' '),
    }];
  });
}

function intervalsOverlap(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left[0] <= right[1] && right[0] <= left[1];
}

function buildConclusion(aggregates, mode) {
  if (mode === 'fixture') {
    return {
      status: 'deterministic_only',
      statement: 'Dynamic assembly is assessed against configured deterministic selection, safety, token, cost, and failure thresholds; live-model superiority is not established by fixture mode.',
    };
  }
  const full = aggregates[CONTEXT_STRATEGIES.FULL_HISTORY];
  const dynamic = aggregates[CONTEXT_STRATEGIES.DYNAMIC];
  if (!full || !dynamic
    || full.answerRelevance.status === 'unavailable'
    || dynamic.answerRelevance.status === 'unavailable') {
    return { status: 'unavailable', statement: 'Required live quality data is unavailable.' };
  }
  const overlap = intervalsOverlap(
    full.answerRelevance.confidenceInterval95,
    dynamic.answerRelevance.confidenceInterval95,
  ) || intervalsOverlap(
    full.factualGrounding.confidenceInterval95,
    dynamic.factualGrounding.confidenceInterval95,
  );
  return overlap
    ? {
      status: 'inconclusive',
      statement: 'Observed live quality differences overlap in uncertainty; no strategy winner is claimed.',
    }
    : {
      status: 'difference_observed',
      statement: 'A live quality difference was observed outside the reported intervals; review per-case failures and dataset representativeness before rollout.',
    };
}

function assessThresholds(deltas, thresholds) {
  const dynamic = deltas[CONTEXT_STRATEGIES.DYNAMIC];
  if (!dynamic) return { status: 'unavailable', checks: {} };
  const checks = {
    answerRelevance: dynamic.answerRelevance >= thresholds.minimumAnswerRelevanceDelta,
    factualGrounding: dynamic.factualGrounding >= thresholds.minimumFactualGroundingDelta,
    reservationStateAccuracy: dynamic.reservationStateAccuracy >= thresholds.minimumReservationAccuracyDelta,
    memoryAccuracy: dynamic.memoryAccuracy >= thresholds.minimumMemoryAccuracyDelta,
    inputTokenReduction: dynamic.inputTokenReduction !== null
      && dynamic.inputTokenReduction >= thresholds.minimumInputTokenReduction,
    estimatedCostReduction: dynamic.estimatedCostReduction !== null
      && dynamic.estimatedCostReduction >= thresholds.minimumEstimatedCostReduction,
    contextFailureRate: dynamic.contextFailureRate <= thresholds.maximumContextFailureRateIncrease,
  };
  return {
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    checks,
  };
}

function fixtureExecutor({ evaluationCase }) {
  return Promise.resolve({ answer: evaluationCase.referenceAnswer || '', latencyMs: 0 });
}

async function traceResult(service, parent, result) {
  if (!parent || !service) return;
  const trace = parent.child('evaluation', 'Context strategy evaluation', {
    parentTraceId: parent.id,
    caseId: result.caseId,
    category: result.category,
    strategy: result.strategy,
    repeat: result.repeat,
    strategyVersion: STRATEGY_CONFIGURATION_VERSION,
  });
  await service.createLangSmithRun?.(trace);
  if (result.failureCategory) {
    await service.failLangSmithRun?.(trace, Object.assign(new Error('Context evaluation failed'), {
      code: result.failureCategory,
    }));
    trace.error(new Error('Context evaluation failed'));
    return;
  }
  const safe = {
    answerRelevance: result.scores.answerRelevance,
    factualGrounding: result.scores.factualGrounding,
    reservationStateAccuracy: result.scores.reservationStateAccuracy,
    memoryAccuracy: result.scores.memoryAccuracy,
    inputTokens: result.scores.inputTokens,
    inputTokenSource: result.scores.inputTokenSource,
    contextBuildLatencyMs: result.scores.contextBuildLatencyMs,
    endToEndLatencyMs: result.scores.endToEndLatencyMs,
    estimatedContextCostUsd: result.scores.inputCostUsd,
    estimatedTotalCostUsd: result.scores.totalCostUsd,
    selectionMetrics: result.context.metrics,
  };
  trace.end(safe);
  await service.completeLangSmithRun?.(trace, safe);
}

async function runContextStrategyComparison({
  dataset = [],
  executeModel = fixtureExecutor,
  judgeModel,
  strategies = DEFAULT_STRATEGIES,
  config = {},
  service = observabilityService,
  trace = false,
} = {}) {
  if (typeof executeModel !== 'function') throw new TypeError('executeModel must be a function.');
  if (judgeModel !== undefined && typeof judgeModel !== 'function') {
    throw new TypeError('judgeModel must be a function when supplied.');
  }
  const mode = config.mode === 'live' ? 'live' : 'fixture';
  const repeats = Number.isSafeInteger(config.repeats) && config.repeats > 0
    ? config.repeats : mode === 'live' ? 3 : 1;
  const lastN = Number.isSafeInteger(config.lastN) && config.lastN > 0
    ? config.lastN : DEFAULT_LAST_N;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
  const runConfig = {
    mode,
    repeats,
    lastN,
    model: config.model || dataset[0]?.model || null,
    promptVersion: config.promptVersion || 'context-strategy-eval-v1',
    temperature: config.temperature ?? 0,
    seed: config.seed ?? 42,
    toolAvailability: config.toolAvailability || 'none_side_effect_free',
    aggregationStage: 'generation_only',
    strategyVersion: STRATEGY_CONFIGURATION_VERSION,
  };
  const rootTrace = trace ? service.startTrace({
    type: 'evaluation_run',
    name: 'Context selection strategy comparison',
    metadata: {
      datasetVersion: config.datasetVersion || '1.0.0',
      strategyVersion: STRATEGY_CONFIGURATION_VERSION,
      caseCount: dataset.length,
      strategyCount: strategies.length,
      repeats,
      mode,
      configurationHash: createStableHash(runConfig),
    },
  }) : null;
  if (rootTrace) await service.createLangSmithRun?.(rootTrace);
  const results = [];
  for (const sourceCase of dataset) {
    const eligible = sourceCase.eligibleStrategies || strategies;
    for (const strategy of strategies.filter((name) => eligible.includes(name))) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        const evaluationCase = structuredClone(sourceCase);
        try {
          const contextResult = await buildContextForStrategy(strategy, evaluationCase, { lastN });
          const modelStartedAt = Date.now();
          const modelResult = await executeModel({
            evaluationCase: structuredClone(evaluationCase),
            strategy,
            repeat,
            messages: structuredClone(contextResult.providerMessages),
            operationalState: structuredClone(contextResult.operationalState),
            settings: structuredClone(runConfig),
          });
          const judgeScores = judgeModel ? await judgeModel({
            evaluationCase: structuredClone(evaluationCase),
            strategy,
            repeat,
            answer: modelResult?.answer || '',
            messages: structuredClone(contextResult.providerMessages),
            settings: structuredClone(runConfig),
          }) : modelResult?.judgeScores;
          const normalizedModelResult = {
            ...modelResult,
            ...(judgeScores ? { judgeScores } : {}),
            latencyMs: Number.isFinite(modelResult?.latencyMs)
              ? modelResult.latencyMs : Date.now() - modelStartedAt,
          };
          const result = {
            caseId: evaluationCase.id,
            category: evaluationCase.category,
            strategy,
            repeat,
            correlationId: createStableHash({
              dataset: config.datasetVersion || '1.0.0',
              caseId: evaluationCase.id,
              strategy,
              repeat,
            }).slice(0, 24),
            modelSettingsHash: createStableHash(runConfig),
            context: contentFreeSelection(contextResult),
            scores: scoreContextStrategyRun({ evaluationCase, contextResult, modelResult: normalizedModelResult }),
            failureCategory: null,
          };
          results.push(result);
          await traceResult(service, rootTrace, result);
        } catch (error) {
          const result = {
            caseId: evaluationCase.id,
            category: evaluationCase.category,
            strategy,
            repeat,
            correlationId: createStableHash({ caseId: evaluationCase.id, strategy, repeat }).slice(0, 24),
            modelSettingsHash: createStableHash(runConfig),
            context: null,
            scores: null,
            failureCategory: classifyEvaluationFailure(error),
          };
          results.push(result);
          await traceResult(service, rootTrace, result);
        }
      }
    }
  }
  const aggregates = Object.fromEntries(strategies.map((strategy) => [
    strategy,
    aggregateStrategy(strategy, results.filter((result) => result.strategy === strategy)),
  ]));
  const deltas = regressionDeltas(aggregates);
  const report = {
    schemaVersion: 1,
    evaluationType: 'context_selection_strategy_comparison',
    datasetVersion: config.datasetVersion || '1.0.0',
    configuration: runConfig,
    thresholds,
    perCase: results,
    aggregates,
    byCategory: aggregateByCategory(results, strategies),
    regressionDeltasAgainstFullHistory: deltas,
    qualityVersusTokens: Object.fromEntries(strategies.map((strategy) => [strategy, {
      quality: aggregates[strategy].answerRelevance.mean,
      inputTokens: aggregates[strategy].inputTokens.mean,
    }])),
    qualityVersusCost: Object.fromEntries(strategies.map((strategy) => [strategy, {
      quality: aggregates[strategy].answerRelevance.mean,
      estimatedCostUsd: aggregates[strategy].estimatedCost.total.mean,
    }])),
    disagreements: findDisagreements(results, thresholds.materialDisagreementDelta),
    acceptance: assessThresholds(deltas, thresholds),
    conclusion: buildConclusion(aggregates, mode),
    limitations: [
      mode === 'fixture'
        ? 'Fixture mode evaluates deterministic selection assertions; it does not estimate provider response variance.'
        : 'Live model scores are nondeterministic and must be interpreted with their confidence intervals.',
      'Cost values are estimates from the repository model-pricing registry; unknown models remain unpriced.',
      'Overlapping confidence intervals are inconclusive and must not be presented as a strategy win.',
    ],
  };
  if (rootTrace) {
    const safe = {
      status: report.acceptance.status,
      caseCount: dataset.length,
      resultCount: results.length,
      strategyVersion: STRATEGY_CONFIGURATION_VERSION,
    };
    rootTrace.end(safe);
    await service.completeLangSmithRun?.(rootTrace, safe);
  }
  return report;
}

export {
  DEFAULT_STRATEGIES,
  DEFAULT_THRESHOLDS,
  aggregateByCategory,
  aggregateStrategy,
  assessThresholds,
  distribution,
  failureMetric,
  findDisagreements,
  buildConclusion,
  fixtureExecutor,
  qualityMetric,
  regressionDeltas,
  runContextStrategyComparison,
};

export default runContextStrategyComparison;
