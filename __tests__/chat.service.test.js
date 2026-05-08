import { jest } from '@jest/globals';

const mockBuildConversationContext = jest.fn();
const mockGenerateResponse = jest.fn();
const mockGetConversationMessages = jest.fn();
const mockSaveExchange = jest.fn();
const mockBuildContext = jest.fn();

await jest.unstable_mockModule('../src/services/conversation.service.js', () => ({
  default: {
    buildConversationContext: mockBuildConversationContext,
    getConversationMessages: mockGetConversationMessages,
    saveExchange: mockSaveExchange,
  },
}));

await jest.unstable_mockModule('../src/ai/openai.service.js', () => ({
  default: {
    generateResponse: mockGenerateResponse,
  },
}));

await jest.unstable_mockModule('../src/services/rag.service.js', () => ({
  default: {
    buildContext: mockBuildContext,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: chatService } = await import('../src/services/chat.service.js');

describe('ChatService orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildContext.mockImplementation((messages) => ({
      messages,
      sources: [],
    }));
  });

  it('generates a response and stores the exchange for the active conversation', async () => {
    const conversationMessages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Where should I look for quetzals?' },
    ];
    mockBuildConversationContext.mockResolvedValue(conversationMessages);
    mockGenerateResponse.mockResolvedValue('Look for quetzals near Monteverde at dawn.');

    const result = await chatService.processMessage(
      'Where should I look for quetzals?',
      'conversation-123',
      '127.0.0.1'
    );

    expect(result).toEqual({
      conversationId: 'conversation-123',
      response: 'Look for quetzals near Monteverde at dawn.',
      sources: [],
    });
    expect(mockBuildConversationContext).toHaveBeenCalledWith(
      'Where should I look for quetzals?',
      'conversation-123'
    );
    expect(mockBuildContext).toHaveBeenCalledWith(
      conversationMessages,
      'Where should I look for quetzals?',
      {
        clientIP: '127.0.0.1',
        conversationId: 'conversation-123',
      }
    );
    expect(mockGenerateResponse).toHaveBeenCalledWith(conversationMessages, {
      clientIP: '127.0.0.1',
      conversationId: 'conversation-123',
    });
    expect(mockSaveExchange).toHaveBeenCalledWith(
      'conversation-123',
      'Where should I look for quetzals?',
      'Look for quetzals near Monteverde at dawn.'
    );
  });

  it('sends RAG-augmented messages to OpenAI', async () => {
    const conversationMessages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Tell me about toucans.' },
    ];
    const augmentedMessages = [
      { role: 'system', content: 'System prompt' },
      { role: 'system', content: 'Retrieved context' },
      { role: 'user', content: 'Tell me about toucans.' },
    ];

    mockBuildConversationContext.mockResolvedValue(conversationMessages);
    mockBuildContext.mockResolvedValue({
      messages: augmentedMessages,
      sources: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde',
          similarityScore: 0.98,
        },
      ],
    });
    mockGenerateResponse.mockResolvedValue('Toucans are common near Sarapiqui.');

    const result = await chatService.processMessage(
      'Tell me about toucans.',
      'conversation-123',
      '127.0.0.1'
    );

    expect(mockGenerateResponse).toHaveBeenCalledWith(augmentedMessages, {
      clientIP: '127.0.0.1',
      conversationId: 'conversation-123',
    });
    expect(result.sources).toEqual([
      {
        name: 'Resplendent Quetzal',
        location: 'Monteverde',
        similarityScore: 0.98,
      },
    ]);
  });

  it('delegates conversation loading to the memory service', async () => {
    mockGetConversationMessages.mockResolvedValue([
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
    ]);

    const messages = await chatService.getConversationMessages('conversation-123');

    expect(messages).toEqual([
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
    ]);
    expect(mockGetConversationMessages).toHaveBeenCalledWith('conversation-123');
  });
});
