import aiQualityRepository from './ai-quality.repository.js';

const METRIC_NAMES = Object.freeze([
  'groundingScore',
  'answerRelevance',
  'retrievalQuality',
  'toolSuccessRate',
]);

function finiteScore(...values) {
  const value = values.find((candidate) => (
    candidate !== null
    && candidate !== undefined
    && candidate !== ''
    && Number.isFinite(Number(candidate))
  ));
  const normalized = Number(value);
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function safeTimestamp(value, fallback = null) {
  const timestamp = new Date(value || fallback);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function caseRows(snapshot = {}) {
  if (Array.isArray(snapshot.cases)) return snapshot.cases;
  if (Array.isArray(snapshot.results)) return snapshot.results;

  const evaluation = snapshot.evaluation;
  if (evaluation && typeof evaluation === 'object') {
    const cases = Object.values(evaluation).flatMap((version) => (
      Array.isArray(version?.cases) ? version.cases : []
    ));
    if (cases.length) return cases;
  }

  return [snapshot];
}

function normalizeToolCounts(row = {}) {
  const counts = row.evaluatedToolExecutions
    || row.toolExecutions
    || row.toolEvaluation
    || row.tools;
  const total = Number(counts?.total ?? counts?.evaluated ?? counts?.count);
  const successful = Number(counts?.successful ?? counts?.successes ?? counts?.passed);

  if (
    Number.isInteger(total)
    && total > 0
    && Number.isInteger(successful)
    && successful >= 0
    && successful <= total
  ) {
    return { successful, total };
  }

  const calls = Array.isArray(row.actualTools)
    ? row.actualTools
    : Array.isArray(row.toolCalls)
      ? row.toolCalls
      : Array.isArray(row.toolCorrectness?.details?.actualTools)
        ? row.toolCorrectness.details.actualTools
        : null;

  if (!calls?.length) return null;

  return {
    successful: calls.filter((call) => (
      typeof call === 'string' || (call?.success !== false && call?.error !== true)
    )).length,
    total: calls.length,
  };
}

function normalizeObservation(row = {}, fallbackTimestamp) {
  const timestamp = safeTimestamp(
    row.timestamp || row.createdAt || row.evaluatedAt,
    fallbackTimestamp,
  );
  if (!timestamp) return null;

  return {
    timestamp,
    groundingScore: finiteScore(
      row.groundingScore,
      row.groundingQuality,
      row.retrieval?.groundingQuality,
    ),
    answerRelevance: finiteScore(
      row.answerRelevance,
      row.relevance,
      row.answer?.relevance,
    ),
    retrievalQuality: finiteScore(
      row.retrievalQuality,
      row.retrieval?.score,
    ),
    toolCounts: normalizeToolCounts(row),
  };
}

function observationsFromSnapshots(snapshots = []) {
  return snapshots.flatMap((snapshot) => {
    const fallbackTimestamp = safeTimestamp(
      snapshot?.timestamp
      || snapshot?.generatedAt
      || snapshot?.createdAt
      || snapshot?.run?.timestamp,
    );

    return caseRows(snapshot)
      .map((row) => normalizeObservation(row, fallbackTimestamp))
      .filter(Boolean);
  });
}

function inRange(timestamp, range) {
  const value = new Date(timestamp).getTime();
  return value >= new Date(range.startAt).getTime()
    && value < new Date(range.endAt).getTime();
}

function aggregatePeriod(observations, range) {
  const period = observations.filter((observation) => inRange(observation.timestamp, range));
  const result = {};

  for (const metric of METRIC_NAMES.filter((name) => name !== 'toolSuccessRate')) {
    const values = period
      .map((observation) => observation[metric])
      .filter((value) => value !== null);
    result[metric] = {
      value: values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null,
      sampleSize: values.length,
    };
  }

  const toolCounts = period
    .map((observation) => observation.toolCounts)
    .filter(Boolean)
    .reduce((totals, counts) => ({
      successful: totals.successful + counts.successful,
      total: totals.total + counts.total,
    }), { successful: 0, total: 0 });
  result.toolSuccessRate = {
    value: toolCounts.total ? toolCounts.successful / toolCounts.total : null,
    sampleSize: toolCounts.total,
  };

  return result;
}

function roundMetric(value) {
  return value === null ? null : Number(value.toFixed(4));
}

function comparePeriods(current, previous) {
  return Object.fromEntries(METRIC_NAMES.map((metric) => {
    const currentMetric = current[metric];
    const previousMetric = previous[metric];
    const delta = currentMetric.value === null || previousMetric.value === null
      ? null
      : currentMetric.value - previousMetric.value;

    return [metric, {
      current: roundMetric(currentMetric.value),
      previous: roundMetric(previousMetric.value),
      delta: roundMetric(delta),
      currentSampleSize: currentMetric.sampleSize,
      previousSampleSize: previousMetric.sampleSize,
    }];
  }));
}

function previousRange(range) {
  const start = new Date(range.startAt).getTime();
  const end = new Date(range.endAt).getTime();
  const duration = end - start;

  return {
    startAt: new Date(start - duration).toISOString(),
    endAt: new Date(start).toISOString(),
  };
}

class AiQualityService {
  constructor({ repository = aiQualityRepository } = {}) {
    this.repository = repository;
  }

  async getQualitySummary(range) {
    const previous = previousRange(range);
    const observations = observationsFromSnapshots(
      await this.repository.getEvaluationSnapshots(),
    );

    return {
      range: { ...range, timezone: 'UTC' },
      previousRange: { ...previous, timezone: 'UTC' },
      metrics: comparePeriods(
        aggregatePeriod(observations, range),
        aggregatePeriod(observations, previous),
      ),
    };
  }
}

export {
  AiQualityService,
  aggregatePeriod,
  comparePeriods,
  normalizeObservation,
  observationsFromSnapshots,
  previousRange,
};
export default new AiQualityService();
