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

const { default: openaiClient } = await import('../src/ai/openai.client.js');
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
});
