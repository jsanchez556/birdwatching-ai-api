import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  ARCHITECTURES,
  buildModelRoutingEvaluationReport,
  measurementFromModelRoutingTelemetry,
  runModelRoutingEvaluation,
} from '../../src/evaluations/runners/modelRoutingEvaluation.runner.js';

const dataset = {
  name: 'routing-evaluation-test',
  version: 1,
  cases: [
    { id: 'chat-1', category: 'chat' },
    { id: 'rag-1', category: 'rag' },
    { id: 'reservation-1', category: 'reservations', reservationOpportunity: true },
    { id: 'reservation-2', category: 'reservations', reservationOpportunity: true },
  ],
};

const measurements = {
  'chat-1:single_model': {
    taskSuccess: true,
    schemaValidation: { success: true, errorCode: null },
    tokens: { input: 100, output: 40, total: 140 },
    cost: 0.02,
    fallbackUsed: false,
    conversionOutcome: 'none',
  },
  'chat-1:routed_models': {
    taskSuccess: true,
    schemaValidation: { success: true, errorCode: null },
    tokens: { input: 70, output: 30, total: 100 },
    cost: 0.01,
    fallbackUsed: false,
    conversionOutcome: 'none',
  },
  'rag-1:single_model': {
    taskSuccess: true,
    schemaValidation: { success: true, errorCode: null },
    tokens: { input: 120, output: 50, total: 170 },
    cost: 0.03,
    fallbackUsed: false,
    conversionOutcome: 'none',
  },
  'rag-1:routed_models': {
    taskSuccess: true,
    schemaValidation: { success: true, errorCode: null },
    tokens: { input: 80, output: 35, total: 115 },
    cost: 0.012,
    fallbackUsed: true,
    conversionOutcome: 'none',
  },
  'reservation-1:single_model': {
    taskSuccess: false,
    schemaValidation: { success: false, errorCode: 'invalid_schema' },
    tokens: { input: 140, output: 60, total: 200 },
    cost: 0.04,
    fallbackUsed: false,
    reservationOpportunity: true,
    conversionOutcome: 'reservation_started',
  },
  'reservation-1:routed_models': {
    taskSuccess: true,
    schemaValidation: { success: true, errorCode: null },
    tokens: { input: 90, output: 40, total: 130 },
    cost: 0.014,
    fallbackUsed: false,
    reservationOpportunity: true,
    conversionOutcome: 'reservation_completed',
  },
  'reservation-2:single_model': {
    taskSuccess: true,
    schemaValidation: { success: null, errorCode: null },
    tokens: { input: 160, output: 70, total: 230 },
    cost: 0.05,
    fallbackUsed: false,
    reservationOpportunity: true,
    conversionOutcome: 'reservation_completed',
  },
  'reservation-2:routed_models': {
    taskSuccess: true,
    schemaValidation: { success: null, errorCode: null },
    tokens: { input: 100, output: 45, total: 145 },
    cost: 0.016,
    fallbackUsed: false,
    reservationOpportunity: true,
    conversionOutcome: 'reservation_completed',
  },
};

function recordedRuns(overrides = {}) {
  return Object.entries(measurements).map(([key, measurement]) => {
    const [caseId, architecture] = key.split(':');
    return {
      caseId,
      architecture,
      taskSuccess: measurement.taskSuccess,
      schemaValidation: measurement.schemaValidation,
      latencyMs: architecture === ARCHITECTURES.SINGLE_MODEL ? 100 : 60,
      tokens: measurement.tokens,
      cost: measurement.cost,
      fallbackUsed: measurement.fallbackUsed,
      reservationOpportunity: measurement.reservationOpportunity === true,
      conversionOutcome: measurement.conversionOutcome,
      ...overrides[key],
    };
  });
}

describe('model-routing architecture evaluation', () => {
  test('executes paired arms in counterbalanced order and calculates measured metrics', async () => {
    const executionOrder = [];
    const clockValues = [
      0, 100,
      200, 260,
      300, 370,
      400, 520,
      600, 740,
      800, 880,
      900, 990,
      1000, 1160,
    ];
    const report = await runModelRoutingEvaluation({
      dataset,
      clock: () => clockValues.shift(),
      executeArchitecture: async ({ architecture, evaluationCase }) => {
        executionOrder.push(`${evaluationCase.id}:${architecture}`);
        return {
          ...measurements[`${evaluationCase.id}:${architecture}`],
          prompt: 'must not be retained',
          response: 'must not be retained',
          rawError: 'must not be retained',
        };
      },
      assessResult: ({ result }) => result,
    });

    expect(executionOrder).toEqual([
      'chat-1:single_model',
      'chat-1:routed_models',
      'rag-1:routed_models',
      'rag-1:single_model',
      'reservation-1:single_model',
      'reservation-1:routed_models',
      'reservation-2:routed_models',
      'reservation-2:single_model',
    ]);
    expect(report.summary).toEqual({
      singleModel: {
        caseCount: 4,
        successRate: 0.75,
        schemaValidity: {
          rate: 0.6667,
          evaluatedCases: 3,
          notApplicableCases: 1,
        },
        averageLatencyMs: 130,
        tokenUsage: {
          averageInput: 130,
          averageOutput: 55,
          averageTotal: 185,
          measuredCases: 4,
          unavailableCases: 0,
        },
        averageCost: 0.035,
        costCoverage: { measuredCases: 4, unavailableCases: 0 },
        fallbackFrequency: 0,
        reservationConversion: {
          rate: 0.5,
          convertedCases: 1,
          opportunityCases: 2,
        },
      },
      routedModels: {
        caseCount: 4,
        successRate: 1,
        schemaValidity: {
          rate: 1,
          evaluatedCases: 3,
          notApplicableCases: 1,
        },
        averageLatencyMs: 75,
        tokenUsage: {
          averageInput: 85,
          averageOutput: 37.5,
          averageTotal: 122.5,
          measuredCases: 4,
          unavailableCases: 0,
        },
        averageCost: 0.013,
        costCoverage: { measuredCases: 4, unavailableCases: 0 },
        fallbackFrequency: 0.25,
        reservationConversion: {
          rate: 1,
          convertedCases: 2,
          opportunityCases: 2,
        },
      },
    });
    expect(report.comparison).toEqual({
      successRateDelta: 0.25,
      schemaValidityDelta: 0.3333,
      averageLatencyMsDelta: -55,
      averageCostDelta: -0.022,
      fallbackFrequencyDelta: 0.25,
      reservationConversionDelta: 0.5,
    });
    expect(JSON.stringify(report)).not.toMatch(/must not be retained|prompt|response|rawError/);

    if (process.env.MODEL_ROUTING_EVAL_TEST_OUTPUT_FILE) {
      const destination = resolve(process.cwd(), process.env.MODEL_ROUTING_EVAL_TEST_OUTPUT_FILE);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
    }
  });

  test('keeps missing token or cost measurements explicit instead of fabricating averages', () => {
    const runs = recordedRuns({
      'rag-1:routed_models': {
        tokens: null,
        cost: null,
      },
    });
    const report = buildModelRoutingEvaluationReport({ dataset, runs });

    expect(report.summary.routedModels).toMatchObject({
      tokenUsage: {
        measuredCases: 3,
        unavailableCases: 1,
      },
      averageCost: null,
      costCoverage: {
        measuredCases: 3,
        unavailableCases: 1,
      },
    });
  });

  test('rejects missing pairs, unknown fields, and inconsistent conversion opportunities', () => {
    const runs = recordedRuns();
    expect(() => buildModelRoutingEvaluationReport({
      dataset,
      runs: runs.slice(1),
    })).toThrow(/Missing measured run/);

    expect(() => buildModelRoutingEvaluationReport({
      dataset,
      runs: runs.map((run, index) => index === 0 ? { ...run, answer: 'unsafe' } : run),
    })).toThrow(/unknown or missing fields/);

    expect(() => buildModelRoutingEvaluationReport({
      dataset,
      runs: runs.map((run) => (
        run.caseId === 'reservation-1' && run.architecture === ARCHITECTURES.ROUTED_MODELS
          ? {
            ...run,
            reservationOpportunity: false,
            conversionOutcome: 'reservation_started',
          }
          : run
      )),
    })).toThrow(/Reservation opportunity differs/);

    expect(() => buildModelRoutingEvaluationReport({
      dataset,
      runs: runs.map((run, index) => index === 0 ? { ...run, latencyMs: '100' } : run),
    })).toThrow(/invalid latency/);

    expect(() => buildModelRoutingEvaluationReport({
      dataset,
      runs: runs.map((run, index) => index === 0 ? { ...run, fallbackUsed: true } : run),
    })).toThrow(/Single-model result/);
  });

  test('requires explicit task-success assessment even when execution throws', async () => {
    await expect(runModelRoutingEvaluation({
      dataset: { cases: [{ id: 'failure-case' }] },
      clock: (() => {
        let value = 0;
        return () => value += 10;
      })(),
      executeArchitecture: async () => {
        throw new Error('provider detail');
      },
      assessResult: ({ error }) => ({
        taskSuccess: false,
        schemaValidation: { success: null, errorCode: null },
        tokens: null,
        cost: null,
        fallbackUsed: false,
        conversionOutcome: error ? 'none' : 'not_applicable',
      }),
    })).resolves.toMatchObject({
      summary: {
        singleModel: { successRate: 0 },
        routedModels: { successRate: 0 },
      },
    });
  });

  test('maps canonical routing telemetry into a content-free measured result', () => {
    expect(measurementFromModelRoutingTelemetry({
      taskSuccess: true,
      reservationOpportunity: true,
      record: {
        canonical: {
          schemaValidation: { success: true, errorCode: null },
          latency: 850,
          tokens: { input: 90, output: 30, total: 120 },
          cost: 0.004,
          fallbackModel: 'gpt-4o-mini',
        },
        dimensions: {
          conversionOutcome: 'reservation_completed',
        },
        attempts: [{ prompt: 'must not be mapped' }],
      },
    })).toEqual({
      taskSuccess: true,
      schemaValidation: { success: true, errorCode: null },
      latencyMs: 850,
      tokens: { input: 90, output: 30, total: 120 },
      cost: 0.004,
      fallbackUsed: true,
      reservationOpportunity: true,
      conversionOutcome: 'reservation_completed',
    });
  });
});
