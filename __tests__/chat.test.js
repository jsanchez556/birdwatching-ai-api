import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetConversationMessages = jest.fn();
const mockProcessMessageStream = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/chat.service.js', () => ({
  default: {
    processMessageStream: mockProcessMessageStream,
    getConversationMessages: mockGetConversationMessages,
  },
}));

const { default: app } = await import('../src/app.js');

describe('POST /chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams chat chunks and a done event', async () => {
    mockProcessMessageStream.mockImplementation(async (message, conversationId, clientIP, events) => {
      events.onStart({
        conversationId,
        sources: [],
        meta: {
          promptVersions: {
            chat: '2.1.0',
          },
        },
      });
      events.onChunk('Hello');
      events.onChunk(' from AI');

      return {
        conversationId,
        response: 'Hello from AI',
        sources: [],
        meta: {
          promptVersions: {
            chat: '2.1.0',
          },
        },
      };
    });

    const res = await request(app)
      .post('/chat')
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: start');
    expect(res.text).toContain('data: {"conversationId":"conversation-123","sources":[]');
    expect(res.text).toContain('event: chunk');
    expect(res.text).toContain('data: {"content":"Hello"}');
    expect(res.text).toContain('data: {"content":" from AI"}');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('data: {"conversationId":"conversation-123","response":"Hello from AI"');
    expect(mockProcessMessageStream).toHaveBeenCalledWith(
      'Hi',
      'conversation-123',
      expect.stringMatching(/(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)/),
      expect.objectContaining({
        onStart: expect.any(Function),
        onChunk: expect.any(Function),
        onReplace: expect.any(Function),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('returns validation errors before opening an SSE stream', async () => {
    const res = await request(app)
      .post('/chat')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockProcessMessageStream).not.toHaveBeenCalled();
  });

  it('sends an SSE error event when streaming fails', async () => {
    mockProcessMessageStream.mockRejectedValue(new Error('Service failure'));

    const res = await request(app)
      .post('/chat')
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('Unable to stream chat response right now.');
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
