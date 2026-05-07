import { jest } from '@jest/globals';
import request from 'supertest';

const mockProcessMessage = jest.fn();
const mockGetConversationMessages = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/chat.service.js', () => ({
  default: {
    processMessage: mockProcessMessage,
    getConversationMessages: mockGetConversationMessages,
  },
}));

const { default: app } = await import('../src/app.js');

describe('POST /chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(app)
      .post('/chat')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid chat payload',
        details: [
          'Message is required and must be a non-empty string',
        ],
      },
    });
  });

  it('returns AI response', async () => {
    mockProcessMessage.mockResolvedValue({
      conversationId: 'conversation-123',
      response: 'Hello from AI',
    });

    const res = await request(app)
      .post('/chat')
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        conversationId: 'conversation-123',
        response: 'Hello from AI',
      },
      meta: {},
    });
    expect(mockProcessMessage).toHaveBeenCalledTimes(1);
    expect(mockProcessMessage).toHaveBeenCalledWith(
      'Hi',
      'conversation-123',
      expect.stringMatching(/(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)/)
    );
  });

  it('returns 500 when service throws', async () => {
    mockProcessMessage.mockRejectedValue(new Error('Service failure'));

    const res = await request(app)
      .post('/chat')
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });
});

describe('GET /chat/:conversationId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns persisted messages for a conversation', async () => {
    mockGetConversationMessages.mockResolvedValue([
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is a strong cloud forest choice.' },
    ]);

    const res = await request(app)
      .get('/chat/conversation-123');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        conversationId: 'conversation-123',
        messages: [
          { role: 'user', content: 'I am visiting Monteverde.' },
          { role: 'assistant', content: 'Monteverde is a strong cloud forest choice.' },
        ],
      },
      meta: {},
    });
    expect(mockGetConversationMessages).toHaveBeenCalledWith('conversation-123');
  });
});
