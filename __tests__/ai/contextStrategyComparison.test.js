import { readFile } from 'node:fs/promises';
import { jest } from '@jest/globals';
import { validateContextStrategyDataset } from '../../src/evaluations/datasets/contextStrategyDataset.js';
import {
  CONTEXT_STRATEGIES,
  buildContextForStrategy,
  contentFreeSelection,
} from '../../src/evaluations/strategies/contextSelection.strategies.js';
import {
  aggregateStrategy,
  runContextStrategyComparison,
} from '../../src/evaluations/runners/contextStrategyComparison.runner.js';
import { classifyEvaluationFailure } from '../../src/evaluations/scorers/contextStrategy.scorer.js';

const datasetDocument = validateContextStrategyDataset(JSON.parse(await readFile(
  new URL('../../src/evaluations/datasets/context-strategy-dataset.json', import.meta.url),
  'utf8',
)));
const byId = new Map(datasetDocument.cases.map((entry) => [entry.id, entry]));

describe('context selection strategy comparison', () => {
  it('ships complete synthetic fixtures covering required context categories', () => {
    expect(datasetDocument.description).toMatch(/synthetic/i);
    expect(datasetDocument.cases.length).toBeGreaterThanOrEqual(7);
    const serialized = JSON.stringify(datasetDocument);
    for (const field of [
      'conversation', 'summary', 'memories', 'ragCandidates', 'toolResults',
      'reservationState', 'expectedRelevantContextIds', 'mustExcludeContextIds',
      'deterministicAssertions', 'eligibleStrategies',
    ]) expect(serialized).toContain(`"${field}"`);
    expect(new Set(datasetDocument.cases.map((entry) => entry.category))).toEqual(expect.objectContaining({
      size: expect.any(Number),
    }));
  });

  it('constructs full history and documented Last-6 from identical source data', async () => {
    const source = byId.get('reservation-multiple-participant-corrections');
    const original = structuredClone(source);
    const full = await buildContextForStrategy(CONTEXT_STRATEGIES.FULL_HISTORY, source);
    const recent = await buildContextForStrategy(CONTEXT_STRATEGIES.LAST_N, source, { lastN: 6 });

    expect(full.selectedItems.filter((item) => (
      item.type === 'conversation' && item.id !== 'current-request'
    ))).toHaveLength(10);
    expect(recent.selectedItems.filter((item) => (
      item.type === 'conversation' && item.id !== 'current-request'
    ))
      .map((item) => item.id)).toEqual(['m5', 'm6', 'm7', 'm8', 'm9', 'm10']);
    expect(recent.configuration).toEqual({ lastN: 6 });
    expect(source).toEqual(original);
    expect(full.operationalState.bookingArguments.participants).toBe(4);
    expect(recent.operationalState.bookingArguments.participants).toBe(4);
  });

  it('uses dynamic summary, memory, RAG filtering, deduplication, and compaction', async () => {
    const memory = await buildContextForStrategy(
      CONTEXT_STRATEGIES.DYNAMIC,
      byId.get('memory-explicit-recent-preference'),
    );
    expect(memory.selectedItems.filter((item) => item.type === 'memory').map((item) => item.id))
      .toContain('mem-afternoon');
    expect(memory.selectedItems.map((item) => item.id)).not.toContain('mem-morning-old');
    expect(memory.selectedItems.map((item) => item.id)).not.toContain('mem-budget-expired');
    expect(memory.selectedItems.map((item) => item.id)).not.toContain('mem-hummingbird');

    const rag = await buildContextForStrategy(
      CONTEXT_STRATEGIES.DYNAMIC,
      byId.get('rag-duplicates-contradiction-and-injection'),
    );
    expect(rag.selectedItems.filter((item) => item.type === 'rag').map((item) => item.id))
      .toEqual(['rag-current']);
    expect(rag.ragReport).toMatchObject({
      candidateCount: 4,
      duplicateCount: 1,
      contradictionCount: 1,
      selectedCount: 1,
    });

    const tool = await buildContextForStrategy(
      CONTEXT_STRATEGIES.DYNAMIC,
      byId.get('large-tool-result-compaction'),
    );
    expect(tool.metrics.toolResultsCompacted).toBe(1);
    expect(tool.selectedItems.find((item) => item.type === 'toolResult')?.content)
      .not.toContain('internalMargin');

    const pressure = await buildContextForStrategy(
      CONTEXT_STRATEGIES.DYNAMIC,
      byId.get('long-history-budget-pressure-with-summary'),
    );
    expect(pressure.metrics.summaryVersion).toBe(9);
    expect(pressure.metrics.discardedContextItems).toBeGreaterThan(0);
  });

  it('never promotes proposed or cleared reservation values into booking arguments', async () => {
    const source = byId.get('reservation-proposed-clear-not-operational');
    for (const strategy of Object.values(CONTEXT_STRATEGIES)) {
      const result = await buildContextForStrategy(strategy, source);
      expect(result.operationalState).toMatchObject({
        version: 9,
        status: 'collecting_information',
        bookingEligible: false,
        bookingArguments: null,
        proposedFieldNames: ['participants', 'pickupLocation'],
      });
    }
  });

  it('uses identical model settings per strategy, isolates fixtures, and correlates repeats once', async () => {
    const calls = [];
    const source = byId.get('empty-optional-context');
    const original = structuredClone(source);
    const report = await runContextStrategyComparison({
      dataset: [source],
      config: { mode: 'live', repeats: 2, lastN: 6, seed: 7, temperature: 0 },
      executeModel: async (request) => {
        calls.push(request);
        request.evaluationCase.currentRequest = 'mutated locally';
        return {
          answer: source.referenceAnswer,
          usage: { promptTokens: 100, completionTokens: 20 },
          latencyMs: 12,
        };
      },
      judgeModel: async () => ({ answerRelevance: 0.9, factualGrounding: 0.8 }),
    });

    expect(calls).toHaveLength(6);
    expect(new Set(calls.map((call) => JSON.stringify(call.settings)))).toHaveProperty('size', 1);
    expect(new Set(report.perCase.map((result) => result.modelSettingsHash))).toHaveProperty('size', 1);
    expect(new Set(report.perCase.map((result) => result.correlationId))).toHaveProperty('size', 6);
    expect(report.aggregates.dynamic.tokenSemantics).toEqual({ actual: 2, estimated: 0 });
    expect(report.aggregates.dynamic.answerRelevance.mean).toBe(0.9);
    expect(report.perCase.every((result) => result.scores.qualityScoreSource === 'model_judge'))
      .toBe(true);
    expect(report.conclusion.status).toBe('inconclusive');
    expect(source).toEqual(original);
  });

  it('labels estimated tokens, prices known models, and leaves unknown prices unavailable', async () => {
    const known = await runContextStrategyComparison({
      dataset: [byId.get('empty-optional-context')],
    });
    expect(known.aggregates.dynamic.tokenSemantics).toEqual({ actual: 0, estimated: 1 });
    expect(known.aggregates.dynamic.estimatedCost).toMatchObject({
      pricedRequestCount: 1,
      unpricedRequestCount: 0,
      semantics: 'estimated_from_model_pricing_registry',
    });

    const unknown = await runContextStrategyComparison({
      dataset: [byId.get('long-history-budget-pressure-with-summary')],
    });
    expect(unknown.aggregates.dynamic.estimatedCost.total.status).toBe('unavailable');
    expect(unknown.aggregates.dynamic.estimatedCost).toMatchObject({
      pricedRequestCount: 0,
      unpricedRequestCount: 1,
    });
  });

  it('records classified failures instead of excluding them and reports unavailable aggregates honestly', async () => {
    expect(classifyEvaluationFailure({ code: 'CONTEXT_SCOPE_MISMATCH' })).toBe('scope');
    const report = await runContextStrategyComparison({
      dataset: [byId.get('empty-optional-context')],
      strategies: [CONTEXT_STRATEGIES.FULL_HISTORY],
      executeModel: async () => {
        throw Object.assign(new Error('private context'), { code: 'CONTEXT_EXPIRED' });
      },
    });
    expect(report.perCase).toEqual([
      expect.objectContaining({ failureCategory: 'freshness', scores: null, context: null }),
    ]);
    expect(report.aggregates.full_history.contextFailureRate).toEqual({
      status: 'available', numerator: 1, denominator: 1, rate: 1,
    });
    expect(aggregateStrategy('dynamic', []).answerRelevance).toEqual({
      status: 'unavailable', mean: null, sampleCount: 0,
      unavailableCount: 0, variance: null, confidenceInterval95: null,
    });
  });

  it('exports only content-free evaluation trace metadata', async () => {
    const exported = [];
    const makeTrace = (id, metadata = {}) => ({
      id,
      metadata,
      child: (type, name, childMetadata) => makeTrace(`${id}-child`, childMetadata),
      end: jest.fn(),
      error: jest.fn(),
    });
    const service = {
      startTrace: jest.fn(({ metadata }) => makeTrace('root', metadata)),
      createLangSmithRun: jest.fn(async (trace) => exported.push({ phase: 'create', metadata: trace.metadata })),
      completeLangSmithRun: jest.fn(async (trace, details) => exported.push({ phase: 'complete', details })),
      failLangSmithRun: jest.fn(),
    };
    const source = structuredClone(byId.get('empty-optional-context'));
    source.currentRequest = 'SENSITIVE QUESTION';
    source.referenceAnswer = 'SENSITIVE ANSWER';
    await runContextStrategyComparison({ dataset: [source], trace: true, service });

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain('SENSITIVE QUESTION');
    expect(serialized).not.toContain('SENSITIVE ANSWER');
    expect(serialized).not.toContain('providerMessages');
    expect(serialized).toContain('strategyVersion');
    expect(contentFreeSelection(await buildContextForStrategy('dynamic', source)))
      .not.toHaveProperty('providerMessages');
  });

  it('passes configured fixture thresholds and reports strategy disagreements', async () => {
    const report = await runContextStrategyComparison({
      dataset: datasetDocument.cases,
      config: { datasetVersion: datasetDocument.datasetVersion, lastN: 6 },
    });
    expect(report.acceptance.status).toBe('passed');
    expect(report.conclusion.status).toBe('deterministic_only');
    expect(report.regressionDeltasAgainstFullHistory.dynamic).toMatchObject({
      factualGrounding: expect.any(Number),
      memoryAccuracy: expect.any(Number),
      inputTokenReduction: expect.any(Number),
      estimatedCostReduction: expect.any(Number),
    });
    expect(report.disagreements.length).toBeGreaterThan(0);
    expect(report.byCategory).toHaveProperty('reservation_corrections');
  });
});
