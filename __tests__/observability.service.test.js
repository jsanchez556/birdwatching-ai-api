import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const { AiTelemetry, normalizeTokenUsage, sanitizeTelemetryValue } = await import('../src/monitoring/aiTelemetry.js');
const {
  ObservabilityService,
  configureLangSmithEnvironment,
  isTracingEnabled,
  validateLangSmithUrl,
} = await import('../src/observability/observability.service.js');

describe('AI observability service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LANGCHAIN_API_KEY;
    delete process.env.LANGCHAIN_TRACING;
    delete process.env.LANGCHAIN_PROJECT;
  });

  it('reports tracing as enabled only when LangSmith config is complete', () => {
    expect(isTracingEnabled({
      langChainTracingV2: true,
      langChainApiKey: 'test-key',
      langChainProject: 'birdwatching-ai',
    })).toBe(true);

    expect(isTracingEnabled({
      langChainTracingV2: true,
      langChainProject: 'birdwatching-ai',
    })).toBe(false);
  });

  it('resolves run URLs through the SDK and allows only HTTPS LangSmith origins', async () => {
    const langSmithClient = {
      getRunUrl: jest.fn()
        .mockResolvedValueOnce('https://smith.langchain.com/o/project/r/trace-1')
        .mockResolvedValueOnce('https://smith.langchain.com.evil.test/r/trace-1'),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      langSmithClient,
    });

    await expect(service.getTraceUrl('trace-1')).resolves.toBe(
      'https://smith.langchain.com/o/project/r/trace-1'
    );
    await expect(service.getTraceUrl('trace-2')).resolves.toBeNull();
    expect(validateLangSmithUrl('http://smith.langchain.com/r/trace')).toBeNull();
    expect(validateLangSmithUrl('https://example.com/r/trace')).toBeNull();
    expect(validateLangSmithUrl('https://user:password@smith.langchain.com/r/trace')).toBeNull();
    expect(validateLangSmithUrl('https://smith.langchain.com:8443/r/trace')).toBeNull();
  });

  it('configures LangSmith environment variables without exposing secrets in config', () => {
    configureLangSmithEnvironment({
      langChainTracingV2: true,
      langChainApiKey: 'secret-langsmith-key',
      langChainProject: 'birdwatching-ai',
    });

    expect(process.env.LANGCHAIN_TRACING).toBe('true');
    expect(process.env.LANGCHAIN_API_KEY).toBe('secret-langsmith-key');
    expect(process.env.LANGCHAIN_PROJECT).toBe('birdwatching-ai');
  });

  it('tracks latency, token usage, and errors through trace lifecycle helpers', async () => {
    const telemetry = new AiTelemetry({ log: mockLogger });
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      telemetry,
      idFactory: () => 'trace-1',
      langSmithClient,
      clock: {
        now: jest.fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(140)
          .mockReturnValueOnce(200)
          .mockReturnValueOnce(225)
          .mockReturnValueOnce(250),
      },
    });

    await expect(service.trace({
      type: 'llm',
      name: 'test_completion',
      metadata: {
        conversationId: 'conversation-1',
        prompt: 'should redact',
      },
      tokenUsage: (result) => result.usage,
      outputMetadata: (result) => ({ requestId: result.id }),
    }, async () => ({
      id: 'completion-1',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }))).resolves.toMatchObject({ id: 'completion-1' });

    await expect(service.trace({
      type: 'tool_execution',
      name: 'searchTours',
    }, async () => {
      throw new Error('tool failed');
    })).rejects.toThrow('tool failed');

    expect(telemetry.getSnapshot()).toMatchObject({
      counters: {
        tracesStarted: 2,
        tracesCompleted: 1,
        tracesFailed: 1,
        errors: 1,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      latencies: [
        expect.objectContaining({
          traceId: 'trace-1',
          traceType: 'llm',
          durationMs: 40,
          metadata: {
            requestId: 'completion-1',
          },
        }),
      ],
    });
    expect(langSmithClient.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: 'trace-1',
      name: 'test_completion',
      run_type: 'llm',
      project_name: 'birdwatching-ai',
      inputs: {
        metadata: {
          conversationId: 'conversation-1',
          prompt: '[redacted]',
        },
      },
    }));
    expect(langSmithClient.updateRun).toHaveBeenCalledWith('trace-1', expect.objectContaining({
      outputs: {
        requestId: 'completion-1',
      },
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    }));
    expect(langSmithClient.updateRun).toHaveBeenCalledWith('trace-1', expect.objectContaining({
      error: 'tool failed',
    }));
  });

  it('propagates parent trace IDs into telemetry and LangSmith runs', async () => {
    const telemetry = new AiTelemetry({ log: mockLogger });
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      telemetry,
      idFactory: () => 'child-trace-1',
      langSmithClient,
      clock: {
        now: jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(125).mockReturnValueOnce(150),
      },
    });

    await expect(service.trace({
      type: 'rag_pipeline',
      name: 'chat_rag_pipeline',
      parentTraceId: 'root-trace-1',
      metadata: {
        parentTraceId: 'root-trace-1',
        conversationId: 'conversation-1',
      },
    }, async () => ({ sourceCount: 1 }))).resolves.toEqual({ sourceCount: 1 });

    expect(mockLogger.info).toHaveBeenCalledWith('AI trace started', expect.objectContaining({
      event: 'ai_trace_started',
      traceId: 'child-trace-1',
      parentTraceId: 'root-trace-1',
      traceType: 'rag_pipeline',
    }));
    expect(langSmithClient.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-trace-1',
      parent_run_id: 'root-trace-1',
      run_type: 'chain',
    }));
    expect(telemetry.getSnapshot()).toMatchObject({
      counters: {
        tracesStarted: 1,
        tracesCompleted: 1,
      },
      latencies: [
        expect.objectContaining({
          traceId: 'child-trace-1',
          traceType: 'rag_pipeline',
        }),
      ],
    });
  });

  it('uses the API correlation ID as the LangSmith root run ID', async () => {
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      telemetry: new AiTelemetry({ log: mockLogger }),
      idFactory: jest.fn(() => 'unexpected-generated-id'),
      langSmithClient,
    });
    const aiTraceId = '11111111-1111-4111-8111-111111111111';

    await service.trace({
      type: 'ai_execution_flow',
      name: 'chat_stream_ai_execution_flow',
      traceId: aiTraceId,
      metadata: {
        aiTraceId,
      },
    }, async () => ({ success: true }));

    expect(service.idFactory).not.toHaveBeenCalled();
    expect(langSmithClient.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: aiTraceId,
      extra: {
        metadata: expect.objectContaining({
          aiTraceId,
        }),
      },
    }));
  });

  it('keeps model cost telemetry in LangSmith completion metadata', async () => {
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      idFactory: () => 'llm-trace-1',
      langSmithClient,
      clock: {
        now: jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(140).mockReturnValueOnce(150),
      },
    });

    await service.trace({
      type: 'llm',
      name: 'chat_completion',
      metadata: {
        model: 'gpt-4o-mini',
        promptVersion: '2.4.0',
      },
      tokenUsage: (result) => result.usage,
      outputMetadata: () => ({
        model: 'gpt-4o-mini',
      }),
    }, async () => ({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      },
    }));

    expect(langSmithClient.updateRun).toHaveBeenCalledWith('llm-trace-1', expect.objectContaining({
      outputs: expect.objectContaining({
        model: 'gpt-4o-mini',
        estimatedCostUsd: 0.000027,
      }),
      extra: {
        metadata: expect.objectContaining({
          model: 'gpt-4o-mini',
          promptVersion: '2.4.0',
          estimatedCostUsd: 0.000027,
        }),
      },
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    }));
  });

  it('exports chronological routed attempts with per-attempt usage, cost, and validation', async () => {
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      langSmithClient,
    });

    await service.recordModelRoutingExecution({
      executionId: 'routing-execution-1',
      recordedAt: '2026-07-30T12:00:01.000Z',
      parentTraceId: 'agent-trace-1',
      canonical: {
        requestedTask: 'general_chat',
        selectedModel: 'gpt-4o',
        fallbackModel: 'gpt-4o-mini',
        reason: 'FALLBACK_SERVICE_UNAVAILABLE',
        latency: 1000,
        tokens: { input: 110, output: 20, total: 130 },
        cost: 0.000477,
        retryCount: 0,
        schemaValidation: { success: true, errorCode: null },
        degradedMode: true,
        success: true,
      },
      dimensions: {
        taskCategory: 'general_chat',
        routingTier: 'balanced',
        finalRoutingTier: 'economy',
        selectedModel: 'gpt-4o',
        finalModel: 'gpt-4o-mini',
        userVisibleSuccess: true,
        conversionOutcome: 'none',
      },
      attempts: [
        {
          modelId: 'gpt-4o',
          attemptRole: 'primary',
          routePosition: 0,
          sameModelAttempt: 1,
          durationMs: 600,
          outcome: 'failed',
          errorCategory: 'service_unavailable',
          tokenUsage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
          schemaValidation: { success: null, errorCode: null },
        },
        {
          modelId: 'gpt-4o-mini',
          attemptRole: 'fallback',
          routePosition: 1,
          sameModelAttempt: 1,
          durationMs: 400,
          outcome: 'succeeded',
          tokenUsage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
          schemaValidation: { success: true, errorCode: null },
        },
      ],
    });

    const exported = langSmithClient.createRun.mock.calls[0][0];
    expect(exported).toMatchObject({
      id: 'routing-execution-1',
      parent_run_id: 'agent-trace-1',
      start_time: '2026-07-30T12:00:00.000Z',
      end_time: '2026-07-30T12:00:01.000Z',
      inputs: {
        requestedTask: 'general_chat',
        taskCategory: 'general_chat',
        selectedModel: 'gpt-4o',
        routingTier: 'balanced',
      },
      outputs: {
        finalModel: 'gpt-4o-mini',
        finalRoutingTier: 'economy',
        userVisibleSuccess: true,
      },
      prompt_tokens: 110,
      completion_tokens: 20,
      total_tokens: 130,
    });
    expect(exported.outputs.attempts).toEqual([
      expect.objectContaining({
        attemptRole: 'primary',
        tokens: { input: 10, output: 0, total: 10 },
        estimatedCost: 0.000025,
      }),
      expect.objectContaining({
        attemptRole: 'fallback',
        tokens: { input: 100, output: 20, total: 120 },
        estimatedCost: 0.000027,
        schemaValidation: { success: true, errorCode: null },
      }),
    ]);
  });

  it('includes late trace annotations in LangSmith completion metadata', async () => {
    const telemetry = new AiTelemetry({ log: mockLogger });
    const langSmithClient = {
      createRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      telemetry,
      idFactory: () => 'trace-1',
      langSmithClient,
      clock: {
        now: jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(125).mockReturnValueOnce(150),
      },
    });

    await expect(service.trace({
      type: 'ai_execution_flow',
      name: 'chat_stream_ai_execution_flow',
    }, async (trace) => {
      trace.annotate({
        billing: {
          billingUsageEventId: 'usage-1',
          requestCostUsd: 0.0042,
          modelUsage: [{ model: 'gpt-4o-mini', totalTokens: 42 }],
        },
      });

      return { conversationId: 'conversation-1' };
    })).resolves.toEqual({ conversationId: 'conversation-1' });

    expect(langSmithClient.updateRun).toHaveBeenCalledWith('trace-1', expect.objectContaining({
      extra: {
        metadata: expect.objectContaining({
          billing: {
            billingUsageEventId: 'usage-1',
            requestCostUsd: 0.0042,
            modelUsage: [{ model: 'gpt-4o-mini', totalTokens: 42 }],
          },
        }),
      },
    }));
  });

  it('maps cache traces to LangSmith tool runs', () => {
    const service = new ObservabilityService({
      config: {},
      langSmithClient: null,
    });

    expect(service.toLangSmithRunType('cache')).toBe('tool');
  });

  it('keeps LangSmith export failures non-fatal', async () => {
    const telemetry = new AiTelemetry({ log: mockLogger });
    const service = new ObservabilityService({
      config: {
        langChainTracingV2: true,
        langChainApiKey: 'test-key',
        langChainProject: 'birdwatching-ai',
      },
      telemetry,
      idFactory: () => 'trace-2',
      langSmithClient: {
        createRun: jest.fn().mockRejectedValue(new Error('LangSmith unavailable')),
        updateRun: jest.fn().mockResolvedValue(undefined),
      },
      clock: {
        now: jest.fn().mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(30),
      },
    });

    await expect(service.trace({
      type: 'rag_retrieval',
      name: 'chat_rag_retrieval',
    }, async () => [])).resolves.toEqual([]);

    expect(mockLogger.warn).toHaveBeenCalledWith('LangSmith trace export failed', expect.objectContaining({
      event: 'langsmith_trace_export_failed',
      action: 'create',
      traceId: 'trace-2',
    }));
    expect(telemetry.getSnapshot().counters.tracesCompleted).toBe(1);
  });

  it('normalizes token usage and redacts sensitive telemetry fields', () => {
    expect(normalizeTokenUsage({
      prompt_tokens: 3,
      completion_tokens: 7,
      total_tokens: 10,
    })).toEqual({
      promptTokens: 3,
      completionTokens: 7,
      totalTokens: 10,
    });

    expect(sanitizeTelemetryValue({
      customerEmail: 'jose@example.com',
      nested: {
        apiKey: 'secret',
        safeCount: 2,
      },
    })).toEqual({
      customerEmail: '[redacted]',
      nested: {
        apiKey: '[redacted]',
        safeCount: 2,
      },
    });

    expect(normalizeTokenUsage({
      prompt_tokens: 'not-a-number',
      completionTokens: Infinity,
      total_tokens: null,
    })).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });

    expect(sanitizeTelemetryValue({
      safeArray: Array.from({ length: 10 }, (_, index) => ({ index })),
      safeObject: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`key${index}`, index])),
      nested: {
        level1: {
          level2: {
            level3: {
              level4: {
                safeCount: 1,
              },
            },
          },
        },
      },
    })).toMatchObject({
      safeArray: expect.arrayContaining([{ index: 0 }]),
      safeObject: expect.objectContaining({
        key0: 0,
        key23: 23,
      }),
      nested: {
        level1: {
          level2: {
            level3: '[truncated]',
          },
        },
      },
    });

    const provenance = Array.from({ length: 30 }, (_, index) => ({
      contextItemId: `ctx_${index}`,
      originalContentHash: 'a'.repeat(64),
      content: 'must be redacted',
    }));
    const sanitizedProvenance = sanitizeTelemetryValue({ contextProvenance: provenance });
    expect(sanitizedProvenance.contextProvenance).toHaveLength(30);
    expect(sanitizedProvenance.contextProvenance[0]).toEqual({
      contextItemId: 'ctx_0',
      originalContentHash: 'a'.repeat(64),
      content: '[redacted]',
    });
  });

  it('records centralized AI error events with redacted details', () => {
    const telemetry = new AiTelemetry({ log: mockLogger });

    telemetry.recordAiError('invalid_json_output', {
      toolName: 'checkAvailability',
      arguments: '{"customerEmail":"jose@example.com"}',
      safeCount: 1,
    });

    expect(telemetry.getSnapshot().counters.aiErrors).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalledWith('AI error monitored', {
      event: 'invalid_json_output',
      toolName: 'checkAvailability',
      arguments: '[redacted]',
      safeCount: 1,
    });
  });

  it('records AI evaluation events with sanitized metadata', () => {
    const telemetry = new AiTelemetry({ log: mockLogger });

    telemetry.recordAiEvaluation('langsmith_evaluations_tracked', {
      runId: 'run-1',
      scores: {
        grounding_quality: 0.8,
        answer_relevance: 0.7,
        tool_correctness: 1,
      },
      answer: 'must not be logged',
    });

    expect(telemetry.getSnapshot().counters.aiEvaluations).toBe(1);
    expect(mockLogger.info).toHaveBeenCalledWith('AI evaluation tracked', {
      event: 'langsmith_evaluations_tracked',
      runId: 'run-1',
      scores: {
        grounding_quality: 0.8,
        answer_relevance: 0.7,
        tool_correctness: 1,
      },
      answer: '[redacted]',
    });
  });
});
