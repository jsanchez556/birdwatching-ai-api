const ARCHITECTURES = Object.freeze({
  SINGLE_MODEL: 'single_model',
  ROUTED_MODELS: 'routed_models',
});

const ARCHITECTURE_SET = new Set(Object.values(ARCHITECTURES));
const CONVERSION_OUTCOMES = new Set([
  'none',
  'not_applicable',
  'tour_recommended',
  'tour_selected',
  'reservation_started',
  'reservation_completed',
]);
const RUN_KEYS = Object.freeze([
  'caseId',
  'architecture',
  'taskSuccess',
  'schemaValidation',
  'latencyMs',
  'tokens',
  'cost',
  'fallbackUsed',
  'reservationOpportunity',
  'conversionOutcome',
]);

function round(value, digits = 6) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function normalizeTokens(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Model-routing evaluation tokens must be an object or null.');
  }
  if (!exactKeys(value, ['input', 'output', 'total'])) {
    throw new Error('Model-routing evaluation tokens contain unknown or missing fields.');
  }
  const input = finiteNonNegative(value.input);
  const output = finiteNonNegative(value.output);
  const total = finiteNonNegative(value.total);
  if (input === null || output === null || total === null || total < input + output) {
    throw new Error('Model-routing evaluation tokens must include valid input, output, and total counts.');
  }
  return { input, output, total };
}

function normalizeSchemaValidation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Model-routing evaluation schemaValidation must be an object.');
  }
  if (!exactKeys(value, ['success', 'errorCode'])) {
    throw new Error('schemaValidation contains unknown or missing fields.');
  }
  const success = value.success;
  if (success !== null && typeof success !== 'boolean') {
    throw new Error('schemaValidation.success must be true, false, or null.');
  }
  if (success === false && typeof value.errorCode !== 'string') {
    throw new Error('Failed schema validation requires a bounded errorCode.');
  }
  if (value.errorCode !== null
    && (typeof value.errorCode !== 'string'
      || !/^[a-z0-9_:-]{1,80}$/.test(value.errorCode))) {
    throw new Error('schemaValidation.errorCode must be a bounded code or null.');
  }
  return {
    success,
    errorCode: success === false ? value.errorCode : null,
  };
}

function normalizeMeasuredRun(value, {
  caseId,
  architecture,
  measuredLatencyMs,
  reservationOpportunity,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Evaluation result for "${caseId}" must be an object.`);
  }
  if (typeof value.taskSuccess !== 'boolean') {
    throw new Error(`Evaluation result for "${caseId}" must include boolean taskSuccess.`);
  }
  const suppliedLatency = finiteNonNegative(value.latencyMs);
  if (value.latencyMs !== null && value.latencyMs !== undefined && suppliedLatency === null) {
    throw new Error(`Evaluation result for "${caseId}" has invalid latency.`);
  }
  const latencyMs = suppliedLatency ?? finiteNonNegative(measuredLatencyMs);
  if (latencyMs === null) {
    throw new Error(`Evaluation result for "${caseId}" is missing measured latency.`);
  }
  const cost = finiteNonNegative(value.cost);
  if (value.cost !== null && value.cost !== undefined && cost === null) {
    throw new Error(`Evaluation result for "${caseId}" has invalid cost.`);
  }
  const conversionOutcome = value.conversionOutcome ?? 'none';
  if (!CONVERSION_OUTCOMES.has(conversionOutcome)) {
    throw new Error(`Evaluation result for "${caseId}" has an invalid conversionOutcome.`);
  }

  const normalizedReservationOpportunity = value.reservationOpportunity === true
    || reservationOpportunity === true;
  if (conversionOutcome === 'reservation_completed' && !normalizedReservationOpportunity) {
    throw new Error(`Evaluation result for "${caseId}" converted without an opportunity.`);
  }
  if (architecture === ARCHITECTURES.SINGLE_MODEL && value.fallbackUsed === true) {
    throw new Error(`Single-model result for "${caseId}" cannot use fallback.`);
  }

  return {
    caseId,
    architecture,
    taskSuccess: value.taskSuccess,
    schemaValidation: normalizeSchemaValidation(
      value.schemaValidation || { success: null, errorCode: null },
    ),
    latencyMs,
    tokens: normalizeTokens(value.tokens),
    cost,
    fallbackUsed: architecture === ARCHITECTURES.ROUTED_MODELS
      ? value.fallbackUsed === true
      : false,
    reservationOpportunity: normalizedReservationOpportunity,
    conversionOutcome,
  };
}

function validateRecordedRun(run, datasetIds) {
  if (!exactKeys(run, RUN_KEYS)) {
    throw new Error('Recorded model-routing evaluation runs contain unknown or missing fields.');
  }
  if (typeof run.caseId !== 'string' || !datasetIds.has(run.caseId)) {
    throw new Error('Recorded model-routing evaluation run references an unknown caseId.');
  }
  if (!ARCHITECTURE_SET.has(run.architecture)) {
    throw new Error('Recorded model-routing evaluation run has an invalid architecture.');
  }
  return normalizeMeasuredRun(run, {
    caseId: run.caseId,
    architecture: run.architecture,
    measuredLatencyMs: run.latencyMs,
    reservationOpportunity: run.reservationOpportunity,
  });
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function summarizeArchitecture(runs) {
  const schemaRuns = runs.filter((run) => typeof run.schemaValidation.success === 'boolean');
  const tokenRuns = runs.filter((run) => run.tokens !== null);
  const costRuns = runs.filter((run) => run.cost !== null);
  const reservationRuns = runs.filter((run) => run.reservationOpportunity);
  const converted = reservationRuns.filter(
    (run) => run.conversionOutcome === 'reservation_completed',
  ).length;

  return {
    caseCount: runs.length,
    successRate: round(
      runs.filter((run) => run.taskSuccess).length / runs.length,
      4,
    ),
    schemaValidity: {
      rate: schemaRuns.length
        ? round(schemaRuns.filter((run) => run.schemaValidation.success).length / schemaRuns.length, 4)
        : null,
      evaluatedCases: schemaRuns.length,
      notApplicableCases: runs.length - schemaRuns.length,
    },
    averageLatencyMs: round(average(runs.map((run) => run.latencyMs)), 2),
    tokenUsage: {
      averageInput: tokenRuns.length
        ? round(average(tokenRuns.map((run) => run.tokens.input)), 2)
        : null,
      averageOutput: tokenRuns.length
        ? round(average(tokenRuns.map((run) => run.tokens.output)), 2)
        : null,
      averageTotal: tokenRuns.length
        ? round(average(tokenRuns.map((run) => run.tokens.total)), 2)
        : null,
      measuredCases: tokenRuns.length,
      unavailableCases: runs.length - tokenRuns.length,
    },
    averageCost: costRuns.length === runs.length
      ? round(average(costRuns.map((run) => run.cost)))
      : null,
    costCoverage: {
      measuredCases: costRuns.length,
      unavailableCases: runs.length - costRuns.length,
    },
    fallbackFrequency: round(runs.filter((run) => run.fallbackUsed).length / runs.length, 4),
    reservationConversion: {
      rate: reservationRuns.length ? round(converted / reservationRuns.length, 4) : null,
      convertedCases: converted,
      opportunityCases: reservationRuns.length,
    },
  };
}

function validatePairedRuns(datasetCases, runs) {
  const byPair = new Map();
  for (const run of runs) {
    const key = `${run.caseId}:${run.architecture}`;
    if (byPair.has(key)) throw new Error(`Duplicate measured run "${key}".`);
    byPair.set(key, run);
  }

  for (const evaluationCase of datasetCases) {
    for (const architecture of ARCHITECTURE_SET) {
      const key = `${evaluationCase.id}:${architecture}`;
      if (!byPair.has(key)) throw new Error(`Missing measured run "${key}".`);
    }
    const single = byPair.get(`${evaluationCase.id}:${ARCHITECTURES.SINGLE_MODEL}`);
    const routed = byPair.get(`${evaluationCase.id}:${ARCHITECTURES.ROUTED_MODELS}`);
    if (single.reservationOpportunity !== routed.reservationOpportunity) {
      throw new Error(`Reservation opportunity differs between arms for "${evaluationCase.id}".`);
    }
  }
}

function buildComparison(singleModel, routedModels) {
  return {
    successRateDelta: round(routedModels.successRate - singleModel.successRate, 4),
    schemaValidityDelta: singleModel.schemaValidity.rate === null
      || routedModels.schemaValidity.rate === null
      ? null
      : round(routedModels.schemaValidity.rate - singleModel.schemaValidity.rate, 4),
    averageLatencyMsDelta: round(
      routedModels.averageLatencyMs - singleModel.averageLatencyMs,
      2,
    ),
    averageCostDelta: singleModel.averageCost === null || routedModels.averageCost === null
      ? null
      : round(routedModels.averageCost - singleModel.averageCost),
    fallbackFrequencyDelta: round(
      routedModels.fallbackFrequency - singleModel.fallbackFrequency,
      4,
    ),
    reservationConversionDelta: singleModel.reservationConversion.rate === null
      || routedModels.reservationConversion.rate === null
      ? null
      : round(
        routedModels.reservationConversion.rate - singleModel.reservationConversion.rate,
        4,
      ),
  };
}

export function buildModelRoutingEvaluationReport({
  dataset,
  runs,
  provenance = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const datasetCases = Array.isArray(dataset?.cases) ? dataset.cases : [];
  if (datasetCases.length === 0) {
    throw new Error('Model-routing evaluation requires a non-empty dataset.');
  }
  if (datasetCases.some((evaluationCase) => (
    typeof evaluationCase?.id !== 'string' || evaluationCase.id.length === 0
  ))) {
    throw new Error('Model-routing evaluation cases require unique string IDs.');
  }
  const datasetIds = new Set(datasetCases.map((evaluationCase) => evaluationCase.id));
  if (datasetIds.size !== datasetCases.length) {
    throw new Error('Model-routing evaluation cases require unique string IDs.');
  }
  const normalizedRuns = (runs || []).map((run) => validateRecordedRun(run, datasetIds));
  validatePairedRuns(datasetCases, normalizedRuns);
  const singleRuns = normalizedRuns.filter(
    (run) => run.architecture === ARCHITECTURES.SINGLE_MODEL,
  );
  const routedRuns = normalizedRuns.filter(
    (run) => run.architecture === ARCHITECTURES.ROUTED_MODELS,
  );
  const singleModel = summarizeArchitecture(singleRuns);
  const routedModels = summarizeArchitecture(routedRuns);

  return {
    schemaVersion: 1,
    evaluationType: 'model_routing_comparison',
    evidenceClass: provenance.generatedByActualPipeline === true
      && provenance.labelsPresentedToPipeline === false
      ? 'real_pipeline_output'
      : 'test_execution',
    generatedAt,
    dataset: {
      name: dataset.name || 'unknown',
      version: dataset.version ?? 'unknown',
      caseCount: datasetCases.length,
    },
    provenance: {
      generatedByActualPipeline: provenance.generatedByActualPipeline === true,
      labelsPresentedToPipeline: provenance.labelsPresentedToPipeline === false,
      sourceArtifactId: provenance.sourceArtifactId || null,
      sourceType: provenance.sourceType || 'test_execution',
    },
    summary: {
      singleModel,
      routedModels,
    },
    comparison: buildComparison(singleModel, routedModels),
    runs: normalizedRuns,
  };
}

export async function runModelRoutingEvaluation({
  dataset,
  executeArchitecture,
  assessResult = ({ result }) => result,
  clock = () => Date.now(),
  provenance = {},
} = {}) {
  if (typeof executeArchitecture !== 'function') {
    throw new TypeError('runModelRoutingEvaluation requires executeArchitecture.');
  }
  if (typeof assessResult !== 'function') {
    throw new TypeError('runModelRoutingEvaluation requires a valid assessResult function.');
  }
  const datasetCases = Array.isArray(dataset?.cases) ? dataset.cases : [];
  if (datasetCases.length === 0) {
    throw new Error('Model-routing evaluation requires a non-empty dataset.');
  }

  const runs = [];
  for (const [caseIndex, evaluationCase] of datasetCases.entries()) {
    const order = caseIndex % 2 === 0
      ? [ARCHITECTURES.SINGLE_MODEL, ARCHITECTURES.ROUTED_MODELS]
      : [ARCHITECTURES.ROUTED_MODELS, ARCHITECTURES.SINGLE_MODEL];
    for (const architecture of order) {
      const startedAt = clock();
      let result;
      let executionError = null;
      try {
        result = await executeArchitecture({ architecture, evaluationCase });
      } catch (error) {
        executionError = error;
      }
      const endedAt = clock();
      const assessed = await assessResult({
        architecture,
        evaluationCase,
        result,
        error: executionError,
      });
      runs.push(normalizeMeasuredRun(assessed, {
        caseId: evaluationCase.id,
        architecture,
        measuredLatencyMs: Math.max(0, endedAt - startedAt),
        reservationOpportunity: evaluationCase.reservationOpportunity === true,
      }));
    }
  }

  return buildModelRoutingEvaluationReport({ dataset, runs, provenance });
}

export function measurementFromModelRoutingTelemetry({
  record,
  taskSuccess,
  reservationOpportunity = false,
} = {}) {
  if (!record?.canonical || !record?.dimensions) {
    throw new Error('A normalized model-routing telemetry record is required.');
  }
  return {
    taskSuccess,
    schemaValidation: record.canonical.schemaValidation,
    latencyMs: record.canonical.latency,
    tokens: record.canonical.tokens,
    cost: record.canonical.cost,
    fallbackUsed: record.canonical.fallbackModel !== null,
    reservationOpportunity,
    conversionOutcome: record.dimensions.conversionOutcome,
  };
}

export {
  ARCHITECTURES,
  CONVERSION_OUTCOMES,
  RUN_KEYS,
};
