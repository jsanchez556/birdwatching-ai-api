import { jest } from '@jest/globals';

const mockBuildConversationContext = jest.fn();
const mockGenerateResponse = jest.fn();
const mockGetConversationMessages = jest.fn();
const mockSaveExchange = jest.fn();

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
    });
    expect(mockBuildConversationContext).toHaveBeenCalledWith(
      'Where should I look for quetzals?',
      'conversation-123'
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
