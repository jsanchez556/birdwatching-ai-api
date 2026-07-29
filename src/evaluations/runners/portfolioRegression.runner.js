import {
  evaluateResponse,
  evaluateRetrievalQuality,
} from '../scorers/index.js';

const REAL_OUTPUT_SOURCE_TYPES = new Set([
  'recorded_production_like',
  'staging_evaluation',
  'external_pipeline_fixture',
]);
const RETRIEVAL_STATUSES = new Set(['evaluated', 'not_applicable', 'missing']);
const TOOL_OUTCOME_STATUSES = new Set(['success', 'failure', 'not_applicable']);
const DEFAULT_THRESHOLDS = Object.freeze({
  casePassScore: 0.6,
  overallQuality: 0.7,
  retrievalQuality: 0.5,
  categoryPassRate: 0.5,
});

function roundScore(value) {
  return value === null ? null : Math.round(Number(value) * 10000) / 10000;
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function labelDerivedValues(evaluationCase) {
  const expected = evaluationCase.expectedBehavior || [];
  const criteria = evaluationCase.evaluationCriteria || [];

  return new Set([
    expected.join(' '),
    [evaluationCase.question, ...expected].join(' '),
    [evaluationCase.question, ...expected, ...criteria].join(' '),
  ].map(normalizedText).filter(Boolean));
}

function assertEvidenceIsNotLabelDerived(evaluationCase, output) {
  const forbidden = labelDerivedValues(evaluationCase);
  const candidates = [
    ['assistantResponse', output.assistantResponse],
    ...(output.retrieval?.chunks || []).map((chunk, index) => [
      `retrieval.chunks[${index}].content`,
      chunk?.content,
    ]),
  ];

  for (const [field, value] of candidates) {
    if (forbidden.has(normalizedText(value))) {
      throw new Error(
        `Real output for case "${evaluationCase.id}" is invalid: ${field} is derived from evaluation labels.`,
      );
    }
  }
}

function assertProvenance(payload) {
  const provenance = payload?.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('Real-output artifact must include a provenance object.');
  }
  if (provenance.generatedByActualPipeline !== true) {
    throw new Error('Real-output provenance must attest generatedByActualPipeline=true.');
  }
  if (provenance.labelsPresentedToPipeline !== false) {
    throw new Error('Real-output provenance must attest labelsPresentedToPipeline=false.');
  }
}

function validateAndIndexOutputs(payload, datasetCases) {
  if (payload?.schemaVersion !== 1) {
    throw new Error('Real-output artifact schemaVersion must be 1.');
  }
  if (payload?.evaluationType !== 'portfolio_regression') {
    throw new Error('Real-output artifact evaluationType must be "portfolio_regression".');
  }
  if (!REAL_OUTPUT_SOURCE_TYPES.has(payload?.sourceType)) {
    throw new Error(`Real-output artifact sourceType must be one of: ${[...REAL_OUTPUT_SOURCE_TYPES].join(', ')}.`);
  }
  assertProvenance(payload);
  if (!Array.isArray(payload.cases) || payload.cases.length === 0) {
    throw new Error('Real-output artifact must include a non-empty cases array.');
  }

  const datasetIds = new Set(datasetCases.map((item) => item.id));
  const outputs = new Map();
  for (const [index, output] of payload.cases.entries()) {
    const prefix = `Real output at cases[${index}]`;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(`${prefix} must be an object.`);
    }
    if (typeof output.caseId !== 'string' || !datasetIds.has(output.caseId)) {
      throw new Error(`${prefix} must reference a dataset caseId.`);
    }
    if (outputs.has(output.caseId)) {
      throw new Error(`${prefix} duplicates caseId "${output.caseId}".`);
    }
    const hasResponse = typeof output.assistantResponse === 'string';
    const hasError = output.error && typeof output.error === 'object'
      && typeof output.error.code === 'string';
    if (!hasResponse && !hasError) {
      throw new Error(`${prefix} must include assistantResponse or an explicit error state.`);
    }
    if (!output.retrieval || !RETRIEVAL_STATUSES.has(output.retrieval.status)) {
      throw new Error(`${prefix}.retrieval.status must be evaluated, not_applicable, or missing.`);
    }
    if (
      output.retrieval.status === 'evaluated'
      && !Array.isArray(output.retrieval.chunks)
    ) {
      throw new Error(`${prefix}.retrieval.chunks must be an array when retrieval is evaluated.`);
    }
    for (const [chunkIndex, chunk] of (output.retrieval.chunks || []).entries()) {
      if (
        !chunk
        || typeof chunk.id !== 'string'
        || typeof chunk.content !== 'string'
      ) {
        throw new Error(`${prefix}.retrieval.chunks[${chunkIndex}] must include string id and content.`);
      }
    }
    if (
      output.toolOutcome !== undefined
      && (
        !output.toolOutcome
        || typeof output.toolOutcome !== 'object'
        || !TOOL_OUTCOME_STATUSES.has(output.toolOutcome.status)
      )
    ) {
      throw new Error(`${prefix}.toolOutcome.status must be success, failure, or not_applicable.`);
    }
    outputs.set(output.caseId, output);
  }

  const missingIds = datasetCases
    .map((item) => item.id)
    .filter((caseId) => !outputs.has(caseId));
  if (missingIds.length) {
    throw new Error(`Real-output artifact is missing ${missingIds.length} dataset case(s): ${missingIds.slice(0, 5).join(', ')}.`);
  }

  return outputs;
}

function normalizeThresholds(baseline = {}) {
  const configured = baseline.thresholds || baseline;
  const thresholds = {};
  for (const [name, fallback] of Object.entries(DEFAULT_THRESHOLDS)) {
    const value = Number(configured[name]);
    thresholds[name] = Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : fallback;
  }
  return thresholds;
}

function failureReason({ output, quality, retrieval, thresholds }) {
  const reasons = [];
  if (output.error) reasons.push(`pipeline error: ${output.error.code}`);
  if (!String(output.assistantResponse || '').trim()) reasons.push('assistant output is missing');
  if (quality.score < thresholds.casePassScore) {
    reasons.push(`quality ${quality.score} is below ${thresholds.casePassScore}`);
  }
  if (output.retrieval.status === 'missing') reasons.push('required retrieval output is missing');
  if (
    retrieval
    && retrieval.score < thresholds.retrievalQuality
  ) {
    reasons.push(`retrieval ${retrieval.score} is below ${thresholds.retrievalQuality}`);
  }
  if (output.toolOutcome?.status === 'failure') reasons.push('tool or agent outcome failed');
  return reasons;
}

function summarizeCategories(results) {
  const groups = new Map();
  for (const result of results) {
    const values = groups.get(result.category) || [];
    values.push(result);
    groups.set(result.category, values);
  }

  return Object.fromEntries([...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, rows]) => {
      const retrievalValues = rows
        .map((row) => row.retrievalQuality)
        .filter((value) => value !== null);
      const passed = rows.filter((row) => row.passed).length;
      return [category, {
        evaluatedCaseCount: rows.length,
        passedCaseCount: passed,
        failedCaseCount: rows.length - passed,
        passRate: roundScore(passed / rows.length),
        overallQuality: roundScore(average(rows.map((row) => row.score))),
        retrievalQuality: roundScore(average(retrievalValues)),
        retrievalEvaluatedCaseCount: retrievalValues.length,
        retrievalNotApplicableCaseCount: rows.filter(
          (row) => row.retrievalStatus === 'not_applicable',
        ).length,
        retrievalMissingCaseCount: rows.filter(
          (row) => row.retrievalStatus === 'missing',
        ).length,
      }];
    }));
}

function thresholdViolations(report, thresholds) {
  const violations = [];
  if (report.overallQuality < thresholds.overallQuality) {
    violations.push({
      scope: 'overall',
      metric: 'overallQuality',
      actual: report.overallQuality,
      threshold: thresholds.overallQuality,
    });
  }
  if (
    report.retrievalQuality !== null
    && report.retrievalQuality < thresholds.retrievalQuality
  ) {
    violations.push({
      scope: 'overall',
      metric: 'retrievalQuality',
      actual: report.retrievalQuality,
      threshold: thresholds.retrievalQuality,
    });
  }
  for (const [category, metrics] of Object.entries(report.categories)) {
    if (metrics.passRate < thresholds.categoryPassRate) {
      violations.push({
        scope: 'category',
        category,
        metric: 'passRate',
        actual: metrics.passRate,
        threshold: thresholds.categoryPassRate,
      });
    }
  }
  return violations;
}

function provenanceValue(...values) {
  const value = values.find((candidate) => (
    candidate !== undefined && candidate !== null && candidate !== ''
  ));
  return value ?? 'unknown';
}

function buildProvenance({ dataset, outputs, baseline, categories, sampleCount }) {
  const supplied = outputs.provenance || {};
  const checkedIn = baseline.provenance || {};

  return {
    datasetSource: provenanceValue(supplied.datasetSource, checkedIn.datasetSource),
    datasetPurpose: provenanceValue(supplied.datasetPurpose, checkedIn.datasetPurpose),
    datasetCreationMethod: provenanceValue(
      supplied.datasetCreationMethod,
      checkedIn.datasetCreationMethod,
    ),
    labelingMethod: provenanceValue(supplied.labelingMethod, checkedIn.labelingMethod),
    reviewerInformation: provenanceValue(
      supplied.reviewerInformation,
      supplied.reviewProcess,
      checkedIn.reviewerInformation,
    ),
    baselineCreationDate: provenanceValue(
      baseline.createdAt,
      checkedIn.baselineCreationDate,
    ),
    modelIdentifier: provenanceValue(supplied.modelIdentifier),
    promptVersion: provenanceValue(supplied.promptVersion),
    retrievalIndexVersion: provenanceValue(supplied.retrievalIndexVersion),
    evaluatorVersion: provenanceValue(
      supplied.evaluatorVersion,
      checkedIn.evaluatorVersion,
    ),
    scoringVersion: provenanceValue(
      supplied.scoringVersion,
      checkedIn.scoringVersion,
      'portfolio-regression-report-v1',
    ),
    sourceArtifactId: provenanceValue(outputs.artifactId),
    sourceType: outputs.sourceType,
    collectedAt: provenanceValue(supplied.collectedAt),
    collectionMethod: provenanceValue(supplied.collectionMethod),
    redactionProcess: provenanceValue(supplied.redactionProcess),
    generatedByActualPipeline: true,
    labelsPresentedToPipeline: false,
    sampleCount,
    categoryDistribution: Object.fromEntries(
      Object.entries(categories).map(([category, metrics]) => [
        category,
        metrics.evaluatedCaseCount,
      ]),
    ),
    knownEvaluatorLimitations: provenanceValue(
      supplied.knownEvaluatorLimitations,
      checkedIn.knownEvaluatorLimitations,
    ),
    knownDatasetLimitations: provenanceValue(
      supplied.knownDatasetLimitations,
      checkedIn.knownDatasetLimitations,
    ),
    regenerationConditions: provenanceValue(
      supplied.regenerationConditions,
      checkedIn.regenerationConditions,
    ),
    datasetName: dataset.name || 'unknown',
    datasetVersion: dataset.version ?? 'unknown',
  };
}

export function runPortfolioRegression({
  dataset,
  outputs,
  baseline = {},
  maxFailureExamples = 5,
} = {}) {
  const datasetCases = Array.isArray(dataset?.cases) ? dataset.cases : [];
  if (!datasetCases.length) throw new Error('Evaluation dataset must include a non-empty cases array.');
  const outputByCaseId = validateAndIndexOutputs(outputs, datasetCases);
  const thresholds = normalizeThresholds(baseline);

  const results = datasetCases.map((evaluationCase) => {
    const output = outputByCaseId.get(evaluationCase.id);
    assertEvidenceIsNotLabelDerived(evaluationCase, output);
    const response = output.assistantResponse || '';
    const retrieval = output.retrieval.status === 'evaluated'
      ? evaluateRetrievalQuality({
        question: evaluationCase.question,
        retrievedChunks: output.retrieval.chunks,
        expectedRelevantChunkIds: output.retrieval.expectedRelevantChunkIds || [],
        answer: response,
      })
      : null;
    const quality = evaluateResponse(evaluationCase, response, {
      groundingText: output.retrieval.status === 'evaluated'
        ? output.retrieval.chunks.map((chunk) => chunk.content).join(' ')
        : '',
    });
    const reasons = failureReason({
      output,
      quality,
      retrieval,
      thresholds,
    });

    return {
      id: evaluationCase.id,
      category: evaluationCase.category || 'uncategorized',
      passed: reasons.length === 0,
      score: quality.score,
      groundingScore: quality.grounding,
      answerRelevance: quality.relevance,
      retrievalStatus: output.retrieval.status,
      retrievalQuality: retrieval?.score ?? null,
      toolOutcomeStatus: output.toolOutcome?.status || 'not_applicable',
      evaluatedToolExecutions: output.toolOutcome?.status === 'not_applicable'
        || !output.toolOutcome
        ? null
        : {
          successful: output.toolOutcome.status === 'success' ? 1 : 0,
          total: 1,
        },
      observedOutput: response || `[pipeline error: ${output.error?.code || 'missing_output'}]`,
      expectedBehavior: evaluationCase.expectedBehavior || [],
      failureReason: reasons.join('; ') || null,
    };
  });

  const passedCaseCount = results.filter((result) => result.passed).length;
  const retrievalValues = results
    .map((result) => result.retrievalQuality)
    .filter((value) => value !== null);
  const categories = summarizeCategories(results);
  const report = {
    schemaVersion: 1,
    evaluationType: 'portfolio_regression',
    evidenceClass: 'real_pipeline_output',
    validRealPipelineOutputs: true,
    sourceType: outputs.sourceType,
    sourceArtifactId: outputs.artifactId || null,
    dataset: {
      name: dataset.name || 'unknown',
      version: dataset.version ?? 'unknown',
      caseCount: datasetCases.length,
    },
    thresholds,
    evaluatedCaseCount: results.length,
    passedCaseCount,
    failedCaseCount: results.length - passedCaseCount,
    overallQuality: roundScore(average(results.map((result) => result.score))),
    retrievalQuality: roundScore(average(retrievalValues)),
    retrievalEvaluatedCaseCount: retrievalValues.length,
    retrievalNotApplicableCaseCount: results.filter(
      (result) => result.retrievalStatus === 'not_applicable',
    ).length,
    retrievalMissingCaseCount: results.filter(
      (result) => result.retrievalStatus === 'missing',
    ).length,
    categories,
    results,
  };
  report.provenance = buildProvenance({
    dataset,
    outputs,
    baseline,
    categories,
    sampleCount: results.length,
  });
  report.thresholdViolations = thresholdViolations(report, thresholds);
  report.representativeFailures = results
    .filter((result) => !result.passed)
    .slice(0, maxFailureExamples)
    .map((result) => ({
      caseId: result.id,
      category: result.category,
      observedOutput: result.observedOutput,
      expectedBehavior: result.expectedBehavior,
      failureReason: result.failureReason,
    }));
  report.status = report.thresholdViolations.length || report.failedCaseCount
    ? 'failed'
    : 'passed';

  return report;
}

export {
  DEFAULT_THRESHOLDS,
  REAL_OUTPUT_SOURCE_TYPES,
  assertEvidenceIsNotLabelDerived,
  validateAndIndexOutputs,
};
