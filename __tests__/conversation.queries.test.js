import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: conversationQueries } = await import('../src/db/queries/conversation.queries.js');

describe('ConversationQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveMessage', () => {
    it('should save a chat message and return the result', async () => {
      const mockMessage = {
        id: 1,
        conversation_id: 'conversation-123',
        user_input: 'Hello',
        ai_output: 'Hi there!',
        created_at: new Date()
      };

      mockQuery.mockResolvedValue({ rows: [mockMessage] });

      const result = await conversationQueries.saveMessage('conversation-123', 'Hello', 'Hi there!');

      expect(result).toEqual(mockMessage);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('save_message'),
        ['conversation-123', 'Hello', 'Hi there!']
      );
    });

    it('should save a chat message with an authenticated owner', async () => {
      const mockMessage = {
        id: 1,
        conversation_id: 'conversation-123',
        user_input: 'Hello',
        ai_output: 'Hi there!',
      };
      mockQuery.mockResolvedValue({ rows: [mockMessage] });

      await conversationQueries.saveMessage('conversation-123', 'Hello', 'Hi there!', 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('save_message'),
        ['conversation-123', 'Hello', 'Hi there!', 7]
      );
    });

    it('should save chat-level metadata with a message', async () => {
      const mockMessage = {
        id: 1,
        conversation_id: 'conversation-123',
        user_input: 'Hello',
        ai_output: 'Hi there!',
      };
      const metadata = {
        customerContext: {
          customerName: 'Ana Gomez',
        },
        selectedTourId: 1,
      };
      mockQuery.mockResolvedValue({ rows: [mockMessage] });

      await conversationQueries.saveMessage('conversation-123', 'Hello', 'Hi there!', 7, metadata);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('save_message'),
        ['conversation-123', 'Hello', 'Hi there!', 7, JSON.stringify(metadata)]
      );
    });

    it('should throw error when database fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        conversationQueries.saveMessage('conversation-123', 'Hello', 'Hi')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getLastMessages', () => {
    it('should retrieve recent messages for one conversation in chronological order', async () => {
      const mockMessages = [
        { conversation_id: 'conversation-123', user_input: 'First', ai_output: 'Reply one' },
        { conversation_id: 'conversation-123', user_input: 'Second', ai_output: 'Reply two' },
      ];

      mockQuery.mockResolvedValue({ rows: mockMessages });

      const result = await conversationQueries.getLastMessages('conversation-123', 2);

      expect(result).toEqual(mockMessages);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_last_messages'),
        ['conversation-123', 2]
      );
    });

    it('should scope recent messages to an authenticated user', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await conversationQueries.getLastMessages('conversation-123', 2, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_last_messages'),
        ['conversation-123', 2, 7]
      );
    });
  });

  describe('getByConversationId', () => {
    it('should retrieve only messages from the requested conversation', async () => {
      const mockMessages = [
        {
          id: 1,
          conversation_id: 'conversation-123',
          user_input: 'I am visiting Monteverde.',
          ai_output: 'Monteverde is excellent for cloud forest species.',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockMessages });

      const result = await conversationQueries.getByConversationId('conversation-123', 100);

      expect(result).toEqual(mockMessages);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_conversation_messages'),
        ['conversation-123', 100]
      );
    });

    it('should scope loaded messages to an authenticated user', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await conversationQueries.getByConversationId('conversation-123', 100, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_conversation_messages'),
        ['conversation-123', 100, 7]
      );
    });
  });

  describe('getLatestByUserId', () => {
    it('should return the latest conversation for a user', async () => {
      mockQuery.mockResolvedValue({ rows: [{ conversation_id: 'conversation-latest' }] });

      await expect(conversationQueries.getLatestByUserId(7)).resolves.toBe('conversation-latest');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_message_at DESC NULLS LAST, created_at DESC'),
        [7]
      );
    });

    it('should return null when the user has no conversations', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(conversationQueries.getLatestByUserId(7)).resolves.toBeNull();
    });
  });

  describe('getOwner', () => {
    it('should return the conversation owner', async () => {
      mockQuery.mockResolvedValue({ rows: [{ user_id: 7 }] });

      await expect(conversationQueries.getOwner('conversation-123')).resolves.toBe(7);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM conversations'), ['conversation-123']);
    });
  });

  describe('getMetadata', () => {
    it('should return conversation metadata', async () => {
      const metadata = { selectedTourId: 1 };
      mockQuery.mockResolvedValue({ rows: [{ metadata }] });

      await expect(conversationQueries.getMetadata('conversation-123', 7)).resolves.toEqual(metadata);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM conversations'), ['conversation-123', 7]);
    });

    it('should return empty metadata when the conversation is missing', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(conversationQueries.getMetadata('conversation-123', 7)).resolves.toEqual({});
    });
  });

  describe('getAll', () => {
    it('should retrieve all messages with pagination', async () => {
      const mockMessages = [
        { id: 1, conversation_id: 'conversation-123', user_input: 'Hello', ai_output: 'Hi there!' },
        { id: 2, conversation_id: 'conversation-456', user_input: 'Bird?', ai_output: 'Quetzal!' }
      ];

      mockQuery.mockResolvedValue({ rows: mockMessages });

      const result = await conversationQueries.getAll(0, 100);

      expect(result).toEqual(mockMessages);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_all_messages'),
        [0, 100]
      );
    });
  });

  describe('getById', () => {
    it('should return message by ID', async () => {
      const mockMessage = { id: 1, user_input: 'Hello', ai_output: 'Hi' };
      mockQuery.mockResolvedValue({ rows: [mockMessage] });

      const result = await conversationQueries.getById(1);

      expect(result).toEqual(mockMessage);
    });

    it('should return null if not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await conversationQueries.getById(999);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete message and return true', async () => {
      mockQuery.mockResolvedValue({ rows: [{ deleted: true }] });

      const result = await conversationQueries.delete(1);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('delete_message_by_id'),
        [1]
      );
    });

    it('should return false if no rows deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [{ deleted: false }] });

      const result = await conversationQueries.delete(999);

      expect(result).toBe(false);
    });
  });
});
