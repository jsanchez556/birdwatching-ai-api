import { jest } from '@jest/globals';
import {
  buildContextMetrics,
  toNormalizedContextTelemetry,
} from '../src/ai/context/contextMetrics.js';
import { AiTelemetry, sanitizeTelemetryValue } from '../src/monitoring/aiTelemetry.js';
import {
  AdminService,
  summarizeContextEngineering,
} from '../src/services/admin/admin.service.js';
import { ObservabilityService } from '../src/observability/observability.service.js';

const budget = {
  modelInputLimit: 10_000,
  reservedOutputTokens: 1_000,
  safetyMarginTokens: 100,
  effectiveInputBudget: 8_900,
  policyAllocations: {},
  categories: {},
};

function item(id, type, estimatedTokens, metadata = {}, transformationHistory = []) {
  return { id, type, estimatedTokens, metadata, transformationHistory };
}

describe('context engineering telemetry', () => {
  it('normalizes context counts, section tokens, compaction, summary, memory, RAG, and tools', () => {
    const selected = [
      item('i', 'instruction', 100),
      item('m', 'message', 200),
      item('s', 'summary', 80, { summaryVersion: 4 }, ['conversation_compaction']),
      item('mem', 'memory', 30),
      item('rag', 'rag_document', 150, { ragChunksSelected: 4 }),
      item('tool', 'tool_result', 70, {}, ['field_filtering', 'tool_result_compaction']),
      item('state', 'application_state', 20),
    ];
    const dropped = item('old', 'message', 50);
    const provenance = [
      ...selected.map((entry) => ({
        type: entry.type,
        selected: true,
        selectionReason: 'selected',
        transformations: entry.transformationHistory,
        originalEstimatedTokens: entry.estimatedTokens,
      })),
      {
        type: dropped.type,
        selected: false,
        selectionReason: 'budget',
        transformations: [],
        originalEstimatedTokens: dropped.estimatedTokens,
      },
    ];

    const metrics = buildContextMetrics({
      stage: 'generation',
      task: 'rag_answer',
      model: 'gpt-4o-mini',
      budget,
      candidates: [...selected, dropped],
      selected,
      provenance,
      durationMs: 27.9,
      memoriesRetrieved: 3,
    });

    expect(metrics).toMatchObject({
      candidateContextItems: 8,
      selectedContextItems: 7,
      discardedContextItems: 1,
      inputTokens: 650,
      inputTokenSource: 'estimated',
      tokensByContextType: {
        instructions: 100,
        conversation: 280,
        memories: 30,
        rag: 150,
        toolResults: 70,
        applicationState: 20,
      },
      compactionTriggered: true,
      summaryVersion: 4,
      memoriesRetrieved: 3,
      ragChunksSelected: 4,
      toolResultsCompacted: 1,
      contextBuildLatency: 27,
    });
  });

  it('fails malformed values closed to honest zero and null semantics', () => {
    expect(toNormalizedContextTelemetry({
      candidateContextItems: -2,
      selectedContextItems: 9,
      inputTokens: 'invalid',
      summaryVersion: -1,
      tokensByContextType: { rag: -20 },
    })).toEqual({
      candidateContextItems: 0,
      selectedContextItems: 0,
      discardedContextItems: 0,
      inputTokens: 0,
      inputTokenSource: 'estimated',
      tokensByContextType: {
        instructions: 0,
        conversation: 0,
        memories: 0,
        rag: 0,
        toolResults: 0,
        applicationState: 0,
      },
      compactionTriggered: false,
      summaryVersion: null,
      memoriesRetrieved: 0,
      ragChunksSelected: 0,
      toolResultsCompacted: 0,
      contextBuildLatency: 0,
    });
  });

  it('keeps planning and generation distinct and applies actual final usage by correlation', () => {
    const telemetry = new AiTelemetry({
      log: { info: jest.fn(), warn: jest.fn() },
      clock: { now: () => Date.parse('2026-08-04T12:00:00.000Z') },
    });
    const details = {
      candidateContextItems: 5,
      selectedContextItems: 3,
      discardedContextItems: 2,
      inputTokens: 500,
      inputTokenSource: 'estimated',
      tokensByContextType: {},
      compactionTriggered: false,
      summaryVersion: null,
      memoriesRetrieved: 2,
      ragChunksSelected: 1,
      toolResultsCompacted: 0,
      contextBuildLatency: 12,
    };
    telemetry.recordContextAssembly({
      id: 'planning-trace',
      metadata: { requestCorrelationId: 'request-1', stage: 'planning' },
    }, { ...details, stage: 'planning' });
    telemetry.recordContextAssembly({
      id: 'generation-trace',
      metadata: {
        requestCorrelationId: 'request-1',
        stage: 'generation',
        memoryEligible: true,
        ragEligible: true,
      },
    }, { ...details, stage: 'generation' });
    telemetry.recordContextActualUsage({
      parentTraceId: 'agent-trace',
      metadata: { requestCorrelationId: 'request-1', model: 'gpt-4o-mini' },
    }, { promptTokens: 640 });

    const records = telemetry.getContextEngineeringRecords({
      startAt: '2026-08-04T00:00:00.000Z',
      endAt: '2026-08-05T00:00:00.000Z',
    });
    expect(records).toHaveLength(2);
    expect(records.find((entry) => entry.stage === 'generation')).toMatchObject({
      inputTokens: 640,
      inputTokenSource: 'actual',
      model: 'gpt-4o-mini',
    });
  });

  it('deduplicates correlated stages and implements documented dashboard formulas', () => {
    const summary = summarizeContextEngineering([
      { requestCorrelationId: 'r1', traceId: 'p1', stage: 'planning' },
      {
        requestCorrelationId: 'r1', traceId: 'g1', stage: 'generation',
        inputTokens: 1000, inputTokenSource: 'actual', model: 'gpt-4o-mini',
        ragEligible: true, ragChunksSelected: 4,
        memoryEligible: true, memoriesRetrieved: 2,
        compactionTriggered: true, failureCategory: null,
      },
      {
        requestCorrelationId: 'r2', traceId: 'p2', stage: 'planning',
        failureCategory: 'scope',
      },
    ]);

    expect(summary.aggregation).toMatchObject({
      eligibleRequests: 2,
      finalGenerationRequests: 1,
      planningTraces: 2,
      generationTraces: 1,
      actualTokenRequests: 1,
    });
    expect(summary.metrics).toMatchObject({
      averageInputTokens: { numerator: 1000, denominator: 1, value: 1000 },
      contextCostPerRequest: { numerator: 0.00015, denominator: 1, value: 0.00015 },
      ragContextUtilization: { numerator: 1, denominator: 1, rate: 1 },
      memoryRetrievalRate: { numerator: 1, denominator: 1, rate: 1 },
      compactionFrequency: { numerator: 1, denominator: 1, rate: 1 },
      contextRelatedFailureRate: { numerator: 1, denominator: 2, rate: 0.5 },
    });
  });

  it('returns unavailable metrics and consistently rejects invalid reporting windows', async () => {
    const service = new AdminService({
      telemetry: { getContextEngineeringRecords: jest.fn().mockReturnValue([]) },
      clock: () => new Date('2026-08-04T12:00:00.000Z'),
    });
    await expect(service.getContextEngineering({
      startDate: '2026-08-04T13:00:00.000Z',
      endDate: '2026-08-04T12:00:00.000Z',
    })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

    const result = await service.getContextEngineering({});
    expect(Object.values(result.metrics)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'unavailable', numerator: null, denominator: 0, value: null, rate: null,
      }),
    ]));
  });

  it('redacts context content while retaining bounded normalized telemetry', () => {
    const sanitized = sanitizeTelemetryValue({
      prompt: 'private prompt',
      memoryContent: 'private memory',
      toolPayload: { customerEmail: 'private@example.com' },
      inputTokens: 42,
      tokensByContextType: { memories: 10, rag: 20 },
    });
    expect(JSON.stringify(sanitized)).not.toContain('private');
    expect(sanitized).toMatchObject({
      prompt: '[redacted]',
      memoryContent: '[redacted]',
      inputTokens: 42,
      tokensByContextType: { memories: 10, rag: 20 },
    });
  });

  it('classifies context failures and exports only a content-free failure contract', async () => {
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const telemetry = new AiTelemetry({ log: { info: jest.fn(), warn: jest.fn() } });
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'test-project',
      },
      telemetry,
      langSmithClient,
      idFactory: () => 'context-failure-trace',
    });
    const failure = Object.assign(new Error('private prompt fragment'), {
      code: 'CONTEXT_REQUIRED_BUDGET_EXCEEDED',
    });

    await expect(service.trace({
      type: 'context_assembly',
      name: 'chat_generation_context_assembly',
      metadata: { stage: 'generation', requestCorrelationId: 'request-failed' },
    }, async () => { throw failure; })).rejects.toBe(failure);

    const update = langSmithClient.updateRun.mock.calls[0][1];
    expect(update).toMatchObject({
      error: 'Context processing failed',
      extra: {
        metadata: {
          failureCategory: 'budgeting',
          contextTelemetry: expect.objectContaining({
            candidateContextItems: 0,
            selectedContextItems: 0,
            inputTokens: 0,
          }),
        },
      },
    });
    expect(JSON.stringify(update)).not.toContain('private prompt fragment');
    expect(telemetry.getContextEngineeringRecords()).toEqual([
      expect.objectContaining({ stage: 'generation', failureCategory: 'budgeting' }),
    ]);
  });

  it('exports provider-reported input usage on the correlated final LLM trace', async () => {
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'test-project',
      },
      telemetry: new AiTelemetry({ log: { info: jest.fn(), warn: jest.fn() } }),
      langSmithClient,
      idFactory: () => 'final-llm-trace',
    });
    const estimated = toNormalizedContextTelemetry({
      candidateContextItems: 5,
      selectedContextItems: 3,
      inputTokens: 400,
    });

    await service.trace({
      type: 'llm',
      name: 'chat_completion_stream',
      metadata: {
        requestCorrelationId: 'request-actual',
        model: 'gpt-4o-mini',
        contextTelemetry: { ...estimated, stage: 'generation' },
      },
      tokenUsage: { promptTokens: 460, completionTokens: 20, totalTokens: 480 },
    }, async () => 'safe response');

    expect(langSmithClient.updateRun).toHaveBeenCalledWith(
      'final-llm-trace',
      expect.objectContaining({
        outputs: expect.objectContaining({
          contextTelemetry: expect.objectContaining({
            inputTokens: 460,
            inputTokenSource: 'actual',
          }),
        }),
        extra: {
          metadata: expect.objectContaining({
            contextStage: 'generation',
          }),
        },
      })
    );
  });
});
