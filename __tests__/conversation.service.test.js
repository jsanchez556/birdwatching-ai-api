import { jest } from '@jest/globals';

const mockGetByConversationId = jest.fn();
const mockGetLastMessages = jest.fn();
const mockGetLatestByUserId = jest.fn();
const mockSaveMessage = jest.fn();
const mockGetOwner = jest.fn();
const mockGetMetadata = jest.fn();
const mockGetLatestReservationForConversation = jest.fn();

await jest.unstable_mockModule('../src/db/queries/conversation.queries.js', () => ({
  default: {
    getByConversationId: mockGetByConversationId,
    getLastMessages: mockGetLastMessages,
    getLatestByUserId: mockGetLatestByUserId,
    saveMessage: mockSaveMessage,
    getOwner: mockGetOwner,
    getMetadata: mockGetMetadata,
  },
}));

await jest.unstable_mockModule('../src/services/reservation.service.js', () => ({
  default: {
    getLatestReservationForConversation: mockGetLatestReservationForConversation,
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
    mockGetOwner.mockResolvedValue(null);
    mockGetLatestByUserId.mockResolvedValue(null);
    mockGetMetadata.mockResolvedValue({});
    mockGetLatestReservationForConversation.mockResolvedValue(null);
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

  it('stores authenticated messages with the user owner ID', async () => {
    await conversationService.saveExchange(
      'conversation-123',
      'Book this tour.',
      'I can help with that.',
      { userId: '7' }
    );

    expect(mockSaveMessage).toHaveBeenCalledWith(
      'conversation-123',
      'Book this tour.',
      'I can help with that.',
      7
    );
  });

  it('stores chat-level metadata with messages', async () => {
    const metadata = {
      customerContext: {
        customerName: 'Ana Gomez',
      },
      selectedTourId: 1,
    };

    await conversationService.saveExchange(
      'conversation-123',
      'Book this tour.',
      'Please confirm.',
      { userId: '7', metadata }
    );

    expect(mockSaveMessage).toHaveBeenCalledWith(
      'conversation-123',
      'Book this tour.',
      'Please confirm.',
      7,
      metadata
    );
  });

  it('allows access to conversations owned by the authenticated user', async () => {
    mockGetOwner.mockResolvedValue(7);

    await expect(conversationService.assertCanAccess('conversation-123', 7)).resolves.toBeUndefined();
  });

  it('rejects conversations owned by another user', async () => {
    mockGetOwner.mockResolvedValue(99);

    await expect(conversationService.assertCanAccess('conversation-123', 7)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
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

  it('loads the latest owned conversation for a user', async () => {
    mockGetLatestByUserId.mockResolvedValue('conversation-latest');
    mockGetByConversationId.mockResolvedValue([
      {
        user_input: 'Hello',
        ai_output: 'Hi!',
        created_at: new Date('2026-05-18T10:00:00.000Z'),
      },
    ]);

    const result = await conversationService.getLatestConversationForUser('7');

    expect(mockGetLatestByUserId).toHaveBeenCalledWith(7);
    expect(mockGetByConversationId).toHaveBeenCalledWith('conversation-latest', 100, 7);
    expect(mockGetLatestReservationForConversation).toHaveBeenCalledWith('conversation-latest', { userId: 7 });
    expect(result.conversationId).toBe('conversation-latest');
    expect(result.messages).toHaveLength(2);
    expect(result).not.toHaveProperty('meta');
  });

  it('adds reservation metadata to the latest owned conversation when present', async () => {
    const reservation = {
      reservationId: 42,
      customerName: 'Ana Gomez',
      tourId: 1,
      tourName: 'Monteverde Quetzal Tour',
      transportation: {
        transportationOption: 'shared_shuttle',
        totalPrice: 130,
      },
      transportationPrice: 130,
      grandTotalPrice: 370,
    };

    mockGetLatestByUserId.mockResolvedValue('conversation-latest');
    mockGetByConversationId.mockResolvedValue([
      {
        user_input: 'Book this tour',
        ai_output: 'Your reservation is confirmed.',
        created_at: new Date('2026-05-18T10:00:00.000Z'),
      },
    ]);
    mockGetLatestReservationForConversation.mockResolvedValue(reservation);

    const result = await conversationService.getLatestConversationForUser('7');

    expect(result).toMatchObject({
      conversationId: 'conversation-latest',
      meta: {
        reservation,
      },
    });
  });

  it('adds persisted conversation metadata to the latest owned conversation', async () => {
    const customerContext = {
      customerName: 'Ana Gomez',
      customerEmail: 'ana@example.com',
    };
    const selectedTour = {
      tourId: 1,
      name: 'Monteverde Quetzal Tour',
    };

    mockGetLatestByUserId.mockResolvedValue('conversation-latest');
    mockGetByConversationId.mockResolvedValue([]);
    mockGetMetadata.mockResolvedValue({
      customerContext,
      selectedTour,
      selectedTourId: 1,
    });

    const result = await conversationService.getLatestConversationForUser('7');

    expect(mockGetMetadata).toHaveBeenCalledWith('conversation-latest', 7);
    expect(result).toMatchObject({
      conversationId: 'conversation-latest',
      meta: {
        customerContext,
        selectedTour,
        selectedTourId: 1,
      },
    });
  });

  it('returns an empty latest conversation response when the user has no conversations', async () => {
    mockGetLatestByUserId.mockResolvedValue(null);

    await expect(conversationService.getLatestConversationForUser('7')).resolves.toEqual({
      conversationId: null,
      messages: [],
    });
  });

  it('loads messages only for the authenticated conversation owner', async () => {
    mockGetOwner.mockResolvedValue(7);
    mockGetByConversationId.mockResolvedValue([]);

    await conversationService.getConversationMessages('conversation-123', { userId: '7' });

    expect(mockGetByConversationId).toHaveBeenCalledWith('conversation-123', 100, 7);
  });
});
