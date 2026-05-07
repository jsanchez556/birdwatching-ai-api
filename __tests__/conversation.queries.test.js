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
        expect.stringContaining('INSERT INTO messages'),
        ['conversation-123', 'Hello', 'Hi there!']
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
        { conversation_id: 'conversation-123', user_input: 'Second', ai_output: 'Reply two' },
        { conversation_id: 'conversation-123', user_input: 'First', ai_output: 'Reply one' },
      ];

      mockQuery.mockResolvedValue({ rows: mockMessages });

      const result = await conversationQueries.getLastMessages('conversation-123', 2);

      expect(result).toEqual([
        { conversation_id: 'conversation-123', user_input: 'First', ai_output: 'Reply one' },
        { conversation_id: 'conversation-123', user_input: 'Second', ai_output: 'Reply two' },
      ]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE conversation_id = $1'),
        ['conversation-123', 2]
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
        expect.stringContaining('WHERE conversation_id = $1'),
        ['conversation-123', 100]
      );
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY created_at ASC');
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
        expect.stringContaining('SELECT'),
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
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await conversationQueries.delete(1);

      expect(result).toBe(true);
    });

    it('should return false if no rows deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await conversationQueries.delete(999);

      expect(result).toBe(false);
    });
  });
});
