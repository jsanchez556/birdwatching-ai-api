import { jest } from '@jest/globals';

const mockGetByConversationId = jest.fn();
const mockGetLastMessages = jest.fn();
const mockSaveMessage = jest.fn();

await jest.unstable_mockModule('../src/db/queries/conversation.queries.js', () => ({
  default: {
    getByConversationId: mockGetByConversationId,
    getLastMessages: mockGetLastMessages,
    saveMessage: mockSaveMessage,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: conversationService } = await import('../src/services/conversation.service.js');

describe('ConversationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds context from messages in the active conversation only', async () => {
    mockGetLastMessages.mockResolvedValue([
      {
        conversation_id: 'conversation-123',
        user_input: 'I am visiting Monteverde.',
        ai_output: 'Monteverde is excellent for cloud forest species.',
      },
    ]);

    const messages = await conversationService.buildConversationContext(
      'What spot should I visit first?',
      'conversation-123'
    );

    expect(mockGetLastMessages).toHaveBeenCalledWith('conversation-123', 10);
    expect(messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
      { role: 'user', content: 'What spot should I visit first?' },
    ]);
  });

  it('stores messages with the active conversation ID', async () => {
    mockSaveMessage.mockResolvedValue({
      id: 1,
      conversation_id: 'conversation-123',
      user_input: 'Where should I look for quetzals?',
      ai_output: 'Look for quetzals near Monteverde at dawn.',
    });

    await conversationService.saveExchange(
      'conversation-123',
      'Where should I look for quetzals?',
      'Look for quetzals near Monteverde at dawn.'
    );

    expect(mockSaveMessage).toHaveBeenCalledWith(
      'conversation-123',
      'Where should I look for quetzals?',
      'Look for quetzals near Monteverde at dawn.'
    );
  });

  it('loads persisted conversation messages for API clients', async () => {
    const createdAt = new Date('2026-05-06T10:00:00.000Z');
    mockGetByConversationId.mockResolvedValue([
      {
        id: 1,
        conversation_id: 'conversation-123',
        user_input: 'I am visiting Monteverde.',
        ai_output: 'Monteverde is excellent for cloud forest species.',
        created_at: createdAt,
      },
    ]);

    const messages = await conversationService.getConversationMessages('conversation-123');

    expect(mockGetByConversationId).toHaveBeenCalledWith('conversation-123', 100);
    expect(messages).toEqual([
      {
        role: 'user',
        content: 'I am visiting Monteverde.',
        createdAt,
      },
      {
        role: 'assistant',
        content: 'Monteverde is excellent for cloud forest species.',
        createdAt,
      },
    ]);
  });
});
