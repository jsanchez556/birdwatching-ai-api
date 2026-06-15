import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockCreateUser = jest.fn();
const mockFindByEmail = jest.fn();
const mockFindById = jest.fn();
const mockCreateRefreshToken = jest.fn();
const mockFindActiveRefreshToken = jest.fn();
const mockRevokeRefreshToken = jest.fn();
const mockProcessMessageStream = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/db/queries/user.queries.js', () => ({
  default: {
    create: mockCreateUser,
    findByEmail: mockFindByEmail,
    findById: mockFindById,
  },
}));

await jest.unstable_mockModule('../src/db/queries/refreshToken.queries.js', () => ({
  default: {
    create: mockCreateRefreshToken,
    findActiveByHash: mockFindActiveRefreshToken,
    revokeByHash: mockRevokeRefreshToken,
  },
}));

await jest.unstable_mockModule('../src/services/chat.service.js', () => ({
  default: {
    processMessageStream: mockProcessMessageStream,
  },
}));

const { default: app } = await import('../src/api/app.js');

function authHeader() {
  const token = jwt.sign(
    { email: 'ana@example.com' },
    'test-jwt-secret',
    { subject: 'user-1', expiresIn: '1h' }
  );

  return 'Bearer ' + token;
}

describe('auth endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRefreshToken.mockResolvedValue({});
  });

  it('signs up a user and returns a token with safe profile data', async () => {
    mockCreateUser.mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana Gomez',
      passwordHash: 'hashed-password',
    });

    const res = await request(app)
      .post('/auth/signup')
      .send({
        email: ' Ana@Example.com ',
        password: 'secure-password',
        name: 'Ana Gomez',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.accessTokenExpiresAt).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.refreshTokenExpiresAt).toEqual(expect.any(String));
    expect(res.body.data.user).toEqual({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana Gomez',
      role: 'customer',
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@example.com',
      name: 'Ana Gomez',
      passwordHash: expect.any(String),
    }));
    expect(mockCreateUser.mock.calls[0][0].passwordHash).not.toBe('secure-password');
    expect(mockCreateRefreshToken).toHaveBeenCalledWith({
      userId: 'user-1',
      tokenHash: expect.any(String),
      expiresAt: expect.any(Date),
    });
  });

  it('rejects duplicate signup emails with a safe error', async () => {
    const duplicateError = new Error('duplicate key');
    duplicateError.code = '23505';
    mockCreateUser.mockRejectedValue(duplicateError);

    const res = await request(app)
      .post('/auth/signup')
      .send({
        email: 'ana@example.com',
        password: 'secure-password',
      });

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('logs in a user with valid credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    mockFindByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana Gomez',
      passwordHash,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'ANA@example.com',
        password: 'correct-password',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.accessTokenExpiresAt).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.refreshTokenExpiresAt).toEqual(expect.any(String));
    expect(res.body.data.user).toEqual({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana Gomez',
      role: 'customer',
    });
    expect(mockFindByEmail).toHaveBeenCalledWith('ana@example.com');
    expect(mockCreateRefreshToken).toHaveBeenCalledWith({
      userId: 'user-1',
      tokenHash: expect.any(String),
      expiresAt: expect.any(Date),
    });
  });

  it('refreshes a session and rotates the refresh token', async () => {
    mockFindActiveRefreshToken.mockResolvedValue({
      userId: 'user-1',
      tokenHash: 'stored-hash',
    });
    mockFindById.mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana Gomez',
      role: 'customer',
      passwordHash: 'hashed-password',
    });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'r'.repeat(44) });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      id: 'user-1',
      email: 'ana@example.com',
      role: 'customer',
    });
    expect(mockFindActiveRefreshToken).toHaveBeenCalledWith(expect.any(String));
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith('stored-hash');
    expect(mockCreateRefreshToken).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      tokenHash: expect.any(String),
    }));
  });

  it('rejects expired refresh tokens', async () => {
    mockFindActiveRefreshToken.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'r'.repeat(44) });

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect(mockCreateRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes a refresh token on logout', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: 'r'.repeat(44) });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ revoked: true });
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith(expect.any(String));
  });

  it('uses a generic error for invalid login credentials', async () => {
    mockFindByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'wrong-password',
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

describe('role-aware AI endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts visitor chat requests without a token', async () => {
    mockProcessMessageStream.mockImplementation(async (message, conversationId, clientIP, events) => {
      events.onChunk('Toucans have large bills.');
      return {
        conversationId: conversationId || 'conversation-visitor',
        response: 'Toucans have large bills.',
        sources: [],
        meta: {},
      };
    });

    const res = await request(app)
      .post('/chat')
      .send({ message: 'Tell me about toucans', role: 'visitor' });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('event: done');
    expect(mockProcessMessageStream).toHaveBeenCalledWith(
      'Tell me about toucans',
      undefined,
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        role: 'visitor',
        authUser: undefined,
      })
    );
  });

  it('rejects chat requests with an invalid token', async () => {
    const res = await request(app)
      .post('/chat')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ message: 'Hi' });

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mockProcessMessageStream).not.toHaveBeenCalled();
  });

  it('accepts chat requests with a valid token', async () => {
    mockProcessMessageStream.mockImplementation(async (message, conversationId, clientIP, events) => {
      events.onChunk('Hello');
      return {
        conversationId: conversationId || 'conversation-123',
        response: 'Hello',
        sources: [],
        meta: {},
      };
    });

    const res = await request(app)
      .post('/chat')
      .set('Authorization', authHeader())
      .send({ message: 'Hi', conversationId: 'conversation-123' });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('event: done');
    expect(mockProcessMessageStream).toHaveBeenCalledTimes(1);
  });
});
