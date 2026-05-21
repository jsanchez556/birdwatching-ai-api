import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockGetLatestConversation = jest.fn();
const mockProcessMessageStream = jest.fn();

process.env.AI_RATE_LIMIT_MAX_REQUESTS = '2';

function authHeader(userId = 'user-1') {
  const token = jwt.sign(
    { email: 'ana@example.com' },
    'test-jwt-secret',
    { subject: userId, expiresIn: '1h' }
  );

  return 'Bearer ' + token;
}

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
    getLatestConversation: mockGetLatestConversation,
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
            chat: '2.3.0',
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
            chat: '2.3.0',
          },
        },
      };
    });

    const res = await request(app)
      .post('/chat')
      .set('Authorization', authHeader('chat-stream-user'))
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
      .set('Authorization', authHeader('chat-validation-user'))
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockProcessMessageStream).not.toHaveBeenCalled();
  });

  it('sends an SSE error event when streaming fails', async () => {
    mockProcessMessageStream.mockRejectedValue(new Error('Service failure'));

    const res = await request(app)
      .post('/chat')
      .set('Authorization', authHeader('chat-stream-error-user'))
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('Unable to stream chat response right now.');
  });

  it('returns 429 when authenticated AI requests exceed the per-minute limit', async () => {
    mockProcessMessageStream.mockImplementation(async (message, conversationId, clientIP, events) => {
      events.onChunk('Hello');
      return {
        conversationId: conversationId || 'conversation-123',
        response: 'Hello',
        sources: [],
        meta: {},
      };
    });
    const header = authHeader('chat-rate-limit-user');

    await request(app)
      .post('/chat')
      .set('Authorization', header)
      .send({ message: 'First message' });

    await request(app)
      .post('/chat')
      .set('Authorization', header)
      .send({ message: 'Second message' });

    const res = await request(app)
      .post('/chat')
      .set('Authorization', header)
      .send({ message: 'Third message' });

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AI_RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
    expect(res.headers['retry-after']).toEqual(expect.any(String));
    expect(res.headers['x-ratelimit-limit']).toBe('2');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(mockProcessMessageStream).toHaveBeenCalledTimes(2);
  });
});

describe('GET /chat/latest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the latest conversation for the authenticated user', async () => {
    mockGetLatestConversation.mockResolvedValue({
      conversationId: 'conversation-latest',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
    });

    const res = await request(app)
      .get('/chat/latest')
      .set('Authorization', authHeader('user-1'));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        conversationId: 'conversation-latest',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      },
      meta: {},
    });
    expect(mockGetLatestConversation).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      email: 'ana@example.com',
    }));
  });

  it('returns reservation metadata for the latest conversation when available', async () => {
    mockGetLatestConversation.mockResolvedValue({
      conversationId: 'conversation-latest',
      messages: [
        { role: 'user', content: 'Book this tour' },
        { role: 'assistant', content: 'Your reservation is confirmed.' },
      ],
      meta: {
        reservation: {
          reservationId: 42,
          tourName: 'Monteverde Quetzal Tour',
          transportation: {
            transportationOption: 'shared_shuttle',
            totalPrice: 130,
          },
          transportationPrice: 130,
          grandTotalPrice: 370,
        },
      },
    });

    const res = await request(app)
      .get('/chat/latest')
      .set('Authorization', authHeader('latest-reservation-user'));

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      conversationId: 'conversation-latest',
      messages: [
        { role: 'user', content: 'Book this tour' },
        { role: 'assistant', content: 'Your reservation is confirmed.' },
      ],
    });
    expect(res.body.meta).toEqual({
      reservation: {
        reservationId: 42,
        tourName: 'Monteverde Quetzal Tour',
        transportation: {
          transportationOption: 'shared_shuttle',
          totalPrice: 130,
        },
        transportationPrice: 130,
        grandTotalPrice: 370,
      },
    });
  });

  it('returns an empty latest conversation response when the user has no conversations', async () => {
    mockGetLatestConversation.mockResolvedValue({ conversationId: null, messages: [] });

    const res = await request(app)
      .get('/chat/latest')
      .set('Authorization', authHeader('latest-empty-user'));

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ conversationId: null, messages: [] });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/chat/latest');

    expect(res.statusCode).toBe(401);
    expect(mockGetLatestConversation).not.toHaveBeenCalled();
  });

  it('does not apply the AI request limit to latest conversation reads', async () => {
    mockProcessMessageStream.mockImplementation(async (message, conversationId, clientIP, events) => {
      events.onChunk('Hello');
      return {
        conversationId: conversationId || 'conversation-123',
        response: 'Hello',
        sources: [],
        meta: {},
      };
    });
    mockGetLatestConversation.mockResolvedValue({
      conversationId: 'conversation-latest',
      messages: [],
    });
    const header = authHeader('latest-not-ai-limited-user');

    await request(app)
      .post('/chat')
      .set('Authorization', header)
      .send({ message: 'First message' });

    await request(app)
      .post('/chat')
      .set('Authorization', header)
      .send({ message: 'Second message' });

    const res = await request(app)
      .get('/chat/latest')
      .set('Authorization', header);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      conversationId: 'conversation-latest',
      messages: [],
    });
    expect(mockGetLatestConversation).toHaveBeenCalledTimes(1);
  });
});
