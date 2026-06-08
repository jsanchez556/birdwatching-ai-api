import { jest } from '@jest/globals';

const mockTrace = jest.fn();

await jest.unstable_mockModule('../src/observability/observability.service.js', () => ({
  default: {
    trace: mockTrace,
  },
}));

const {
  traceAiExecutionFlow,
  traceAgentPlanning,
  traceAgentOrchestration,
  traceAgentToolSequence,
  traceConversationContext,
  traceLlmCall,
  traceRagPipeline,
  traceRagRetrieval,
  traceToolExecution,
} = await import('../src/tracing/aiTracing.middleware.js');

describe('AI tracing middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrace.mockImplementation(async (traceOptions, operation) => operation({}));
  });

  it('wraps LLM calls with token usage extraction', async () => {
    const result = await traceLlmCall('chat_completion', {
      parentTraceId: 'root-trace-1',
      conversationId: 'conversation-1',
      model: 'gpt-4o',
    }, async () => ({
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
      },
    }));

    expect(result.usage.total_tokens).toBe(16);
    expect(mockTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'llm',
        name: 'chat_completion',
        parentTraceId: 'root-trace-1',
        metadata: expect.objectContaining({
          parentTraceId: 'root-trace-1',
          conversationId: 'conversation-1',
          model: 'gpt-4o',
        }),
        tokenUsage: expect.any(Function),
      }),
      expect.any(Function)
    );
  });

  it('wraps RAG retrieval and reports result count', async () => {
    await traceRagRetrieval('chat_rag_retrieval', {
      parentTraceId: 'root-trace-1',
      queryLength: 24,
      topK: 3,
    }, async () => [{ id: 'doc-1' }, { id: 'doc-2' }]);

    const traceOptions = mockTrace.mock.calls[0][0];

    expect(traceOptions).toMatchObject({
      type: 'rag_retrieval',
      parentTraceId: 'root-trace-1',
      metadata: expect.objectContaining({
        parentTraceId: 'root-trace-1',
        queryLength: 24,
        topK: 3,
      }),
    });
    expect(traceOptions.outputMetadata([{ id: 'doc-1' }])).toEqual({
      resultCount: 1,
    });
  });

  it('wraps RAG pipeline grounding context metadata', async () => {
    await traceRagPipeline('chat_rag_pipeline', {
      parentTraceId: 'root-trace-1',
      conversationId: 'conversation-1',
      inputMessageCount: 2,
    }, async () => ({
      messages: [
        { role: 'system' },
        { role: 'system' },
        { role: 'user' },
      ],
      ragTrace: {
        retrievedChunkCount: 2,
        sourceCount: 1,
        groundedMessageCount: 3,
        contextMessageLength: 256,
      },
    }), {
      outputMetadata: (result) => result.ragTrace,
    });

    const traceOptions = mockTrace.mock.calls[0][0];

    expect(traceOptions).toMatchObject({
      type: 'rag_pipeline',
      name: 'chat_rag_pipeline',
      parentTraceId: 'root-trace-1',
    });
    expect(traceOptions.outputMetadata({
      ragTrace: {
        retrievedChunkCount: 2,
        sourceCount: 1,
        groundedMessageCount: 3,
        contextMessageLength: 256,
      },
    })).toEqual({
      retrievedChunkCount: 2,
      sourceCount: 1,
      groundedMessageCount: 3,
      contextMessageLength: 256,
    });
  });

  it('wraps the end-to-end AI execution flow and conversation context', async () => {
    await traceAiExecutionFlow('chat_stream_ai_execution_flow', {
      conversationId: 'conversation-1',
      role: 'customer',
    }, async () => ({
      conversationId: 'conversation-1',
      response: 'Here is a grounded answer.',
      sources: [{ name: 'Bird source' }],
      meta: {
        promptVersions: { chat: 'v1' },
        toolsCalled: ['searchTours'],
      },
    }));

    await traceConversationContext('chat_conversation_context', {
      parentTraceId: 'root-trace-1',
      conversationId: 'conversation-1',
    }, async () => [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Follow-up' },
    ]);

    expect(mockTrace.mock.calls[0][0]).toMatchObject({
      type: 'ai_execution_flow',
      name: 'chat_stream_ai_execution_flow',
    });
    expect(mockTrace.mock.calls[0][0].outputMetadata({
      conversationId: 'conversation-1',
      response: 'Answer',
      sources: [{ name: 'Bird source' }, { name: 'Tour source' }],
      meta: {
        reservation: { id: 'reservation-1' },
        toolsCalled: ['searchTours'],
        promptVersions: { chat: 'v1' },
      },
    })).toEqual({
      conversationId: 'conversation-1',
      responseLength: 6,
      sourceCount: 2,
      hasReservation: true,
      toolsCalled: ['searchTours'],
      promptVersions: { chat: 'v1' },
    });
    expect(mockTrace.mock.calls[1][0]).toMatchObject({
      type: 'conversation_context',
      name: 'chat_conversation_context',
      parentTraceId: 'root-trace-1',
    });
    expect(mockTrace.mock.calls[1][0].outputMetadata([
      { role: 'system' },
      { role: 'user' },
      { role: 'assistant' },
      { role: 'user' },
    ])).toEqual({
      messageCount: 4,
      roleCounts: {
        system: 1,
        user: 2,
        assistant: 1,
      },
    });
  });

  it('wraps tool execution and agent orchestration with safe metadata', async () => {
    await traceToolExecution('searchTours', {
      parentTraceId: 'agent-trace-1',
      hasArguments: true,
    }, async () => ({
      success: true,
      tours: [{ tourId: 1 }],
    }));

    await traceAgentOrchestration('birdwatching_agent_generate_response', {
      parentTraceId: 'root-trace-1',
      role: 'customer',
    }, async () => 'done');

    expect(mockTrace.mock.calls[0][0]).toMatchObject({
      type: 'tool_execution',
      name: 'searchTours',
      parentTraceId: 'agent-trace-1',
    });
    expect(mockTrace.mock.calls[0][0].outputMetadata({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
    })).toEqual({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      resultCount: undefined,
      attempts: undefined,
    });
    expect(mockTrace.mock.calls[1][0]).toMatchObject({
      type: 'agent_orchestration',
      name: 'birdwatching_agent_generate_response',
      parentTraceId: 'root-trace-1',
    });
  });

  it('wraps agent planning and tool sequence traces with flow metadata', async () => {
    await traceAgentPlanning('birdwatching_agent_planner', {
      parentTraceId: 'agent-trace-1',
      conversationId: 'conversation-1',
    }, async () => ({
      status: 'ready',
      steps: [
        { tool: 'searchTours' },
        { tool: 'checkAvailability' },
      ],
      message: 'Planner guidance.',
    }));

    await traceAgentToolSequence('birdwatching_agent_tool_sequence', {
      parentTraceId: 'agent-trace-1',
      stepCount: 2,
    }, async () => ({
      success: false,
      steps: [
        { id: 'search', tool: 'searchTours' },
        { id: 'availability', tool: 'checkAvailability' },
      ],
      errors: [
        { id: 'availability', tool: 'checkAvailability', code: 'SERVICE_UNAVAILABLE' },
      ],
      debugTrace: {
        skippedSteps: [],
        executions: [
          {
            id: 'search',
            tool: 'searchTours',
            attempts: [{ attempt: 1, status: 'succeeded' }],
          },
          {
            id: 'availability',
            tool: 'checkAvailability',
            attempts: [
              { attempt: 1, status: 'failed' },
              { attempt: 2, status: 'failed' },
            ],
          },
        ],
      },
    }));

    expect(mockTrace.mock.calls[0][0]).toMatchObject({
      type: 'agent_planning',
      name: 'birdwatching_agent_planner',
      parentTraceId: 'agent-trace-1',
    });
    expect(mockTrace.mock.calls[0][0].outputMetadata({
      status: 'ready',
      steps: [{ tool: 'searchTours' }],
      message: 'Planner guidance.',
    })).toEqual({
      status: 'ready',
      stepCount: 1,
      tools: ['searchTours'],
      hasPlannerMessage: true,
      selectedTransportation: false,
      transportationDeclined: false,
      requestedTransportation: false,
    });
    expect(mockTrace.mock.calls[1][0]).toMatchObject({
      type: 'tool_sequence',
      name: 'birdwatching_agent_tool_sequence',
      parentTraceId: 'agent-trace-1',
    });
    expect(mockTrace.mock.calls[1][0].outputMetadata({
      success: false,
      steps: [{ tool: 'searchTours' }],
      errors: [{ tool: 'checkAvailability', code: 'SERVICE_UNAVAILABLE' }],
      debugTrace: {
        skippedSteps: [{ tool: 'createReservation' }],
        executions: [
          {
            id: 'availability',
            tool: 'checkAvailability',
            attempts: [
              { status: 'failed' },
              { status: 'failed' },
            ],
          },
        ],
      },
    })).toEqual({
      success: false,
      executedStepCount: 1,
      errorCount: 1,
      skippedStepCount: 1,
      tools: ['searchTours'],
      failures: [{ tool: 'checkAvailability', code: 'SERVICE_UNAVAILABLE' }],
      retries: [
        {
          id: 'availability',
          tool: 'checkAvailability',
          attempts: 2,
          retryCount: 1,
          failedAttempts: 2,
        },
      ],
    });
  });
});
