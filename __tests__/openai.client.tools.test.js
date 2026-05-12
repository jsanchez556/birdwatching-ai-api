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

describe('OpenAIClient tool calling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes tool calls and sends tool results back for the final response', async () => {
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
                    name: 'checkTourAvailability',
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
    const response = await openaiClient.createChatCompletionWithTools(
      [{ role: 'user', content: 'Is tour 1 available?' }],
      {
        tools: [{ type: 'function', function: { name: 'checkTourAvailability' } }],
        executeToolCall,
        metadata,
        usage,
      }
    );

    expect(response).toBe('The Monteverde tour has 5 slots available.');
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      parallel_tool_calls: false,
      tool_choice: 'auto',
    });
    expect(executeToolCall).toHaveBeenCalledWith(
      'checkTourAvailability',
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
        name: 'checkTourAvailability',
        content: JSON.stringify({
          success: true,
          tourId: 1,
          availableSlots: 5,
        }),
      },
    ]);
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
                    name: 'recommendTours',
                    arguments: '{"location":"Monteverde","limit":2}',
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

    await openaiClient.createChatCompletionWithTools(
      [{ role: 'user', content: 'Recommend tours in Monteverde' }],
      {
        tools: [{ type: 'function', function: { name: 'recommendTours' } }],
        executeToolCall,
        metadata,
      }
    );

    expect(metadata).toMatchObject({
      toolsCalled: ['recommendTours'],
      tours: [
        {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          location: 'Monteverde',
        },
      ],
    });
  });
});
