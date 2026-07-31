import { jest } from '@jest/globals';

const mockCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

await jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  })),
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/tools/index.js', () => ({
  availableTools: [],
  executeToolCall: jest.fn(),
}));

const {
  default: openaiClient,
  OpenAIClient,
  buildEmbeddingCacheKey,
} = await import('../src/ai/clients/openai.client.js');
const { default: logger } = await import('../src/utils/logger.js');

describe('OpenAIClient tool calling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes tool calls and prepares tool results before streaming', async () => {
    const executeToolCall = jest.fn().mockResolvedValue({
      success: true,
      tourId: 1,
      availableSlots: 5,
    });

    mockCreate
      .mockResolvedValueOnce({
        id: 'completion-1',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'checkAvailability',
                    arguments: '{"tourId":1}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 120,
          total_tokens: 1120,
        },
      })
      .mockResolvedValueOnce({
        id: 'completion-2',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The Monteverde tour has 5 slots available.',
            },
          },
        ],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 250,
          total_tokens: 1450,
        },
      });

    const metadata = { conversationId: 'conversation-123' };
    const usage = {};
    const conversation = await openaiClient.resolveChatToolCalls(
      [{ role: 'user', content: 'Is tour 1 available?' }],
      {
        tools: [{ type: 'function', function: { name: 'checkAvailability' } }],
        executeToolCall,
        metadata,
        usage,
      }
    );

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      parallel_tool_calls: false,
      tool_choice: 'auto',
    });
    expect(executeToolCall).toHaveBeenCalledWith(
      'checkAvailability',
      { tourId: 1 },
      expect.objectContaining({ conversationId: 'conversation-123' })
    );
    expect(metadata.openAiUsage).toBeUndefined();
    expect(usage.openAiUsage).toMatchObject({
      promptTokens: 2200,
      completionTokens: 370,
      totalTokens: 2570,
      hasEstimatedCost: true,
      modelUsage: [
        expect.objectContaining({
          model: 'gpt-4o',
          promptTokens: 2200,
          completionTokens: 370,
          totalTokens: 2570,
        }),
      ],
    });
    expect(usage.openAiUsage.estimatedCostDisplay).toMatch(/^\$\d+\.\d{4}$/);

    const secondRequest = mockCreate.mock.calls[1][0];
    expect(secondRequest.messages).toEqual([
      { role: 'user', content: 'Is tour 1 available?' },
      expect.objectContaining({
        role: 'assistant',
        tool_calls: expect.any(Array),
      }),
      {
        role: 'tool',
        tool_call_id: 'call-1',
        name: 'checkAvailability',
        content: JSON.stringify({
          success: true,
          tourId: 1,
          availableSlots: 5,
        }),
      },
    ]);
    expect(conversation).toEqual(secondRequest.messages);
  });

  it('captures structured metadata from tour tool results', async () => {
    const metadata = { conversationId: 'conversation-123' };
    const executeToolCall = jest.fn().mockResolvedValue({
      success: true,
      tours: [
        {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          location: 'Monteverde',
        },
      ],
    });

    mockCreate
      .mockResolvedValueOnce({
        id: 'completion-1',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'searchTours',
                    arguments: '{"location":"Monteverde","recommend":true,"limit":2}',
                  },
                },
              ],
            },
          },
        ],
        usage: {},
      })
      .mockResolvedValueOnce({
        id: 'completion-2',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I found a Monteverde tour.',
            },
          },
        ],
        usage: {},
      });

    await openaiClient.resolveChatToolCalls(
      [{ role: 'user', content: 'Recommend tours in Monteverde' }],
      {
        tools: [{ type: 'function', function: { name: 'searchTours' } }],
        executeToolCall,
        metadata,
      }
    );

    expect(metadata).toMatchObject({
      toolsCalled: ['searchTours'],
      tours: [
        {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          location: 'Monteverde',
        },
      ],
    });
  });

  it('stores oversized tool results and sends only a compact reference to the next model call', async () => {
    const tours = Array.from({ length: 12 }, (_, index) => ({
      tourId: index + 1,
      name: `Tour ${index + 1}`,
      pricePerPerson: 100 + index,
      internalMargin: 0.3,
      supplierContractId: `contract-${index + 1}`,
    }));
    const fullResult = {
      success: true,
      total: 30,
      pagination: { page: 1, pageSize: 12, total: 30, hasMore: true },
      tours,
    };
    const toolResultStore = {
      store: jest.fn().mockResolvedValue({
        referenceId: 'search_tours_openai-ref',
        expiresAt: '2026-08-08T00:00:00Z',
      }),
    };
    const client = new OpenAIClient({ toolResultStore });
    const executeToolCall = jest.fn().mockResolvedValue(fullResult);
    mockCreate
      .mockResolvedValueOnce({
        id: 'completion-large-1',
        model: 'gpt-4o',
        choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-large',
            type: 'function',
            function: { name: 'searchTours', arguments: '{}' },
          }],
        } }],
        usage: {},
      })
      .mockResolvedValueOnce({
        id: 'completion-large-2',
        model: 'gpt-4o',
        choices: [{ message: { role: 'assistant', content: 'I found several tours.' } }],
        usage: {},
      });
    const metadata = { conversationId: 'conversation-123', userId: 7 };

    await client.resolveChatToolCalls([{ role: 'user', content: 'Show tours' }], {
      executeToolCall,
      metadata,
      tools: [{ type: 'function', function: { name: 'searchTours' } }],
    });

    expect(toolResultStore.store).toHaveBeenCalledWith(expect.objectContaining({
      result: fullResult,
      total: 30,
    }));
    const promptResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content);
    expect(promptResult).toEqual(expect.objectContaining({
      resultReferenceId: 'search_tours_openai-ref',
      total: 30,
      omittedResultCount: 25,
    }));
    expect(promptResult.selectedResults).toHaveLength(5);
    expect(JSON.stringify(promptResult)).not.toContain('internalMargin');
    expect(JSON.stringify(promptResult)).not.toContain('supplierContractId');
  });

  it('streams final chat text after resolving tool calls', async () => {
    async function* streamChunks() {
      yield {
        id: 'stream-1',
        model: 'gpt-4o',
        choices: [{ delta: { content: 'The tour ' } }],
      };
      yield {
        id: 'stream-1',
        model: 'gpt-4o',
        choices: [{ delta: { content: 'has 5 slots.' } }],
      };
      yield {
        id: 'stream-1',
        model: 'gpt-4o',
        choices: [],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 50,
          total_tokens: 1250,
        },
      };
    }

    const executeToolCall = jest.fn().mockResolvedValue({
      success: true,
      tourId: 1,
      availableSlots: 5,
    });
    const onChunk = jest.fn();
    const usage = {};

    mockCreate
      .mockResolvedValueOnce({
        id: 'completion-1',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'checkAvailability',
                    arguments: '{"tourId":1}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1100,
        },
      })
      .mockResolvedValueOnce({
        id: 'completion-2',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The tour has 5 slots.',
            },
          },
        ],
        usage: {
          prompt_tokens: 1100,
          completion_tokens: 40,
          total_tokens: 1140,
        },
      })
      .mockResolvedValueOnce(streamChunks());

    const response = await openaiClient.streamChatCompletionWithTools(
      [{ role: 'user', content: 'Is tour 1 available?' }],
      {
        tools: [{ type: 'function', function: { name: 'checkAvailability' } }],
        executeToolCall,
        metadata: { conversationId: 'conversation-123' },
        usage,
        onChunk,
      }
    );

    expect(response).toBe('The tour has 5 slots.');
    expect(onChunk).toHaveBeenNthCalledWith(1, 'The tour ');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'has 5 slots.');
    expect(mockCreate.mock.calls[2][0]).toMatchObject({
      stream: true,
      stream_options: {
        include_usage: true,
      },
    });
    expect(usage.openAiUsage).toMatchObject({
      promptTokens: 3300,
      completionTokens: 190,
      totalTokens: 3490,
      hasEstimatedCost: true,
    });
  });

  it('does not emit a buffered first chunk when the stream fails before output begins', async () => {
    async function* failedBeforeEmission() {
      yield {
        id: 'stream-failed',
        model: 'gpt-4o',
        choices: [{ delta: { content: 'buffered partial' } }],
      };
      throw Object.assign(new Error('temporary provider failure'), { status: 503 });
    }

    const onChunk = jest.fn();
    mockCreate.mockResolvedValueOnce(failedBeforeEmission());

    await expect(openaiClient.streamChatCompletion(
      [{ role: 'user', content: 'Tell me about quetzals.' }],
      { onChunk, maxRetries: 0, timeoutMs: 1000 }
    )).rejects.toMatchObject({ status: 503 });

    expect(onChunk).not.toHaveBeenCalled();
  });

  it('preserves emitted output and surfaces a later stream failure without replacement output', async () => {
    async function* failedAfterEmission() {
      yield {
        id: 'stream-partial',
        model: 'gpt-4o',
        choices: [{ delta: { content: 'first ' } }],
      };
      yield {
        id: 'stream-partial',
        model: 'gpt-4o',
        choices: [{ delta: { content: 'second' } }],
      };
      throw Object.assign(new Error('temporary provider failure'), { status: 503 });
    }

    const onChunk = jest.fn();
    mockCreate.mockResolvedValueOnce(failedAfterEmission());

    await expect(openaiClient.streamChatCompletion(
      [{ role: 'user', content: 'Tell me about quetzals.' }],
      { onChunk, maxRetries: 0, timeoutMs: 1000 }
    )).rejects.toMatchObject({ status: 503 });

    expect(onChunk.mock.calls.map(([chunk]) => chunk)).toEqual(['first ', 'second']);
  });

  it('monitors invalid JSON tool-call output', () => {
    const args = openaiClient.parseToolArguments({
      function: {
        name: 'checkAvailability',
        arguments: '{"tourId":',
      },
    });

    expect(args).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith('AI error monitored', expect.objectContaining({
      event: 'invalid_json_output',
      toolName: 'checkAvailability',
      rawArgumentLength: 10,
      error: expect.objectContaining({
        name: 'SyntaxError',
      }),
    }));
  });

  it('builds deterministic embedding cache keys from normalized input', () => {
    expect(buildEmbeddingCacheKey('  Where   can I see quetzals? ', {
      model: 'text-embedding-3-small',
      inputKind: 'single',
    })).toBe(buildEmbeddingCacheKey('Where can I see quetzals?', {
      model: 'text-embedding-3-small',
      inputKind: 'single',
    }));
    expect(buildEmbeddingCacheKey('Where can I see quetzals?', {
      model: 'text-embedding-3-small',
      inputKind: 'single',
    })).not.toBe(buildEmbeddingCacheKey('Where can I see quetzals?', {
      model: 'text-embedding-3-small',
      inputKind: 'array',
    }));
  });

  it('returns cached embeddings without calling OpenAI', async () => {
    const embeddingCache = {
      get: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
      set: jest.fn(),
    };
    const client = new OpenAIClient({
      embeddingCache,
      redisConfig: { embeddingCacheTtlSeconds: 900 },
      log: logger,
    });

    await expect(client.generateEmbedding('Where can I see quetzals?'))
      .resolves.toEqual([[0.1, 0.2]]);

    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(embeddingCache.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Embedding cache hit', {
      inputCount: 1,
      model: expect.any(String),
    });
  });

  it('writes missed embeddings to cache with the configured TTL', async () => {
    const embeddingCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const client = new OpenAIClient({
      embeddingCache,
      redisConfig: { embeddingCacheTtlSeconds: 900 },
      log: logger,
    });

    mockEmbeddingsCreate.mockResolvedValue({
      id: 'embedding-1',
      model: 'text-embedding-3-small',
      data: [
        { index: 0, embedding: [0.1, 0.2] },
      ],
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
    });

    await expect(client.generateEmbedding('Where can I see quetzals?'))
      .resolves.toEqual([[0.1, 0.2]]);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: expect.any(String),
      input: ['Where can I see quetzals?'],
    });
    expect(embeddingCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^embedding:[a-f0-9]{64}$/),
      {
        embedding: [0.1, 0.2],
        model: expect.any(String),
      },
      { ttlSeconds: 900 }
    );
    expect(logger.info).toHaveBeenCalledWith('Embedding cache miss', {
      inputCount: 1,
      missCount: 1,
      model: expect.any(String),
    });
  });

  it('supports partial cache hits for array input while preserving order', async () => {
    const embeddingCache = {
      get: jest.fn()
        .mockResolvedValueOnce({ embedding: [1, 0] })
        .mockResolvedValueOnce(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const client = new OpenAIClient({
      embeddingCache,
      redisConfig: { embeddingCacheTtlSeconds: 900 },
      log: logger,
    });

    mockEmbeddingsCreate.mockResolvedValue({
      id: 'embedding-1',
      model: 'text-embedding-3-small',
      data: [
        { index: 0, embedding: [0, 1] },
      ],
      usage: {},
    });

    await expect(client.generateEmbedding(['cached question', 'fresh question']))
      .resolves.toEqual([[1, 0], [0, 1]]);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: expect.any(String),
      input: ['fresh question'],
    });
    expect(embeddingCache.set).toHaveBeenCalledTimes(1);
  });

  it('falls back to OpenAI when embedding cache lookup fails', async () => {
    const embeddingCache = {
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const client = new OpenAIClient({
      embeddingCache,
      redisConfig: { embeddingCacheTtlSeconds: 900 },
      log: logger,
    });

    mockEmbeddingsCreate.mockResolvedValue({
      id: 'embedding-1',
      model: 'text-embedding-3-small',
      data: [
        { index: 0, embedding: [0.1, 0.2] },
      ],
      usage: {},
    });

    await expect(client.generateEmbedding('Where can I see quetzals?'))
      .resolves.toEqual([[0.1, 0.2]]);

    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Embedding cache lookup failed', {
      error: 'Redis unavailable',
      model: expect.any(String),
    });
  });
});
