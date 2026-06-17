const LANGSMITH_EVALUATION_DASHBOARDS = Object.freeze([
  {
    id: 'quality-trends',
    title: 'Quality Trends',
    description: 'Tracks evaluation score, answer quality, grounding quality, and tool correctness by prompt version over time.',
    langSmithRunType: 'evaluation_run',
    dimensions: ['promptVersion', 'runId', 'timestamp'],
    metrics: ['score', 'answerQuality', 'groundingQuality', 'toolCorrectness'],
  },
  {
    id: 'regression-detection',
    title: 'Regression Detection',
    description: 'Highlights score drops against the previous run and configured baseline thresholds.',
    langSmithRunType: 'evaluation_comparison',
    dimensions: ['promptVersion', 'runId', 'timestamp'],
    metrics: ['scoreDelta', 'retrievalQualityDelta', 'answerQualityDelta'],
  },
  {
    id: 'retrieval-performance',
    title: 'Retrieval Performance',
    description: 'Tracks retrieval quality and available retrieval precision/recall signals by prompt version and case category.',
    langSmithRunType: 'evaluation_score',
    dimensions: ['promptVersion', 'caseId', 'category', 'timestamp'],
    metrics: ['retrievalQuality', 'retrievalPrecision', 'retrievalRecall', 'groundingQuality'],
  },
]);

function roundMetric(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function toMetricValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + toMetricValue(value), 0) / values.length
    : 0;
}

function getScores(snapshot = {}) {
  return snapshot.score || snapshot.comparison?.scores || {};
}

function getEvaluation(snapshot = {}) {
  return snapshot.evaluation || {};
}

function getRunMetadata(snapshot = {}, index) {
  return {
    runId: snapshot.run?.id || snapshot.runId || `evaluation-run-${index + 1}`,
    timestamp: snapshot.timestamp || snapshot.createdAt || snapshot.run?.timestamp || null,
  };
}

function getVersionNames(snapshot = {}) {
  return [
    ...new Set([
      ...Object.keys(getScores(snapshot)),
      ...Object.keys(getEvaluation(snapshot)),
    ]),
  ];
}

function getVersionMetrics(snapshot = {}, promptVersion) {
  const scoreMetrics = getScores(snapshot)[promptVersion] || {};
  const evaluationMetrics = getEvaluation(snapshot)[promptVersion] || {};

  return {
    promptVersion,
    score: toMetricValue(scoreMetrics.score ?? evaluationMetrics.score),
    answerQuality: toMetricValue(scoreMetrics.answerQuality ?? evaluationMetrics.answerQuality),
    groundingQuality: toMetricValue(scoreMetrics.groundingQuality ?? evaluationMetrics.groundingQuality),
    retrievalQuality: toMetricValue(scoreMetrics.retrievalQuality ?? evaluationMetrics.retrievalQuality),
    toolCorrectness: toMetricValue(scoreMetrics.toolCorrectness ?? evaluationMetrics.toolCorrectness),
    costUsd: toMetricValue(scoreMetrics.costUsd ?? evaluationMetrics.costUsd),
    tokenUsage: scoreMetrics.tokenUsage || evaluationMetrics.tokenUsage || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    cases: Array.isArray(evaluationMetrics.cases) ? evaluationMetrics.cases : [],
  };
}

function buildQualityTrends(runs) {
  return runs.flatMap((snapshot, index) => {
    const runMetadata = getRunMetadata(snapshot, index);

    return getVersionNames(snapshot).map((promptVersion) => ({
      ...runMetadata,
      ...getVersionMetrics(snapshot, promptVersion),
    }));
  });
}

function findPreviousVersionTrend(trends, currentTrend) {
  const previous = trends.filter((trend) => (
    trend.promptVersion === currentTrend.promptVersion
    && trend.runId !== currentTrend.runId
  ));

  return previous[previous.length - 1] || null;
}

function buildRegressionDetection(trends, baseline = {}, threshold = 0) {
  return trends.map((trend) => {
    const previous = findPreviousVersionTrend(trends, trend);
    const previousScore = previous?.score ?? baseline.score ?? trend.score;
    const previousRetrievalQuality = previous?.retrievalQuality
      ?? baseline.retrievalQuality
      ?? trend.retrievalQuality;
    const previousAnswerQuality = previous?.answerQuality
      ?? baseline.answerQuality
      ?? trend.answerQuality;
    const scoreDelta = roundMetric(trend.score - previousScore);
    const retrievalQualityDelta = roundMetric(trend.retrievalQuality - previousRetrievalQuality);
    const answerQualityDelta = roundMetric(trend.answerQuality - previousAnswerQuality);
    const regressions = [
      scoreDelta < -threshold ? 'score' : null,
      retrievalQualityDelta < -threshold ? 'retrievalQuality' : null,
      answerQualityDelta < -threshold ? 'answerQuality' : null,
    ].filter(Boolean);

    return {
      runId: trend.runId,
      timestamp: trend.timestamp,
      promptVersion: trend.promptVersion,
      score: trend.score,
      retrievalQuality: trend.retrievalQuality,
      answerQuality: trend.answerQuality,
      scoreDelta,
      retrievalQualityDelta,
      answerQualityDelta,
      hasRegression: regressions.length > 0,
      regressions,
    };
  });
}

function getCaseRetrievalMetric(evaluationCase = {}, metric) {
  if (Number.isFinite(Number(evaluationCase[metric]))) {
    return Number(evaluationCase[metric]);
  }

  if (metric === 'retrievalQuality') {
    return Number(evaluationCase.retrieval?.score ?? evaluationCase.retrievalQuality ?? 0);
  }

  return Number(evaluationCase.retrieval?.[metric] ?? 0);
}

function buildRetrievalPerformance(runs) {
  return runs.flatMap((snapshot, index) => {
    const runMetadata = getRunMetadata(snapshot, index);

    return getVersionNames(snapshot).flatMap((promptVersion) => {
      const metrics = getVersionMetrics(snapshot, promptVersion);

      if (!metrics.cases.length) {
        return [{
          ...runMetadata,
          promptVersion,
          category: 'all',
          caseCount: 0,
          retrievalQuality: roundMetric(metrics.retrievalQuality),
          retrievalPrecision: 0,
          retrievalRecall: 0,
          groundingQuality: roundMetric(metrics.groundingQuality),
        }];
      }

      const byCategory = metrics.cases.reduce((groups, evaluationCase) => {
        const category = evaluationCase.category || 'uncategorized';
        groups[category] ||= [];
        groups[category].push(evaluationCase);
        return groups;
      }, {});

      return Object.entries(byCategory).map(([category, cases]) => ({
        ...runMetadata,
        promptVersion,
        category,
        caseCount: cases.length,
        retrievalQuality: roundMetric(average(
          cases.map((evaluationCase) => getCaseRetrievalMetric(evaluationCase, 'retrievalQuality')),
        )),
        retrievalPrecision: roundMetric(average(
          cases.map((evaluationCase) => getCaseRetrievalMetric(evaluationCase, 'retrievalPrecision')),
        )),
        retrievalRecall: roundMetric(average(
          cases.map((evaluationCase) => getCaseRetrievalMetric(evaluationCase, 'retrievalRecall')),
        )),
        groundingQuality: roundMetric(average(
          cases.map((evaluationCase) => getCaseRetrievalMetric(evaluationCase, 'groundingQuality')),
        )),
      }));
    });
  });
}

export function buildLangSmithEvaluationDashboards({
  runs = [],
  baseline = {},
  regressionThreshold = 0,
} = {}) {
  const snapshots = Array.isArray(runs) ? runs : [runs];
  const qualityTrends = buildQualityTrends(snapshots);
  const regressionDetection = buildRegressionDetection(
    qualityTrends,
    baseline,
    regressionThreshold,
  );
  const retrievalPerformance = buildRetrievalPerformance(snapshots);

  return {
    dashboards: LANGSMITH_EVALUATION_DASHBOARDS,
    qualityTrends,
    regressionDetection,
    retrievalPerformance,
    summary: {
      runCount: snapshots.length,
      regressionCount: regressionDetection.filter((entry) => entry.hasRegression).length,
      latest: qualityTrends[qualityTrends.length - 1] || null,
    },
  };
}

export { LANGSMITH_EVALUATION_DASHBOARDS };
export default buildLangSmithEvaluationDashboards;
