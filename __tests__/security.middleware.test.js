import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CORS_ORIGINS = ' https://app.example.com, https://admin.example.com , ';
delete process.env.CORS_ALLOWED_HEADERS;

const EXPECTED_DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Filename',
  'X-Conversation-Id',
  'X-Role',
  'X-Response-Mode',
  'X-Customer-Context',
  'X-Conversation-Context',
];
const EXPECTED_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

const BROWSER_PREFLIGHT_CASES = [
  {
    name: 'authenticated GET',
    path: '/chat/latest',
    method: 'GET',
    requestHeaders: ['authorization'],
  },
  {
    name: 'public JSON POST',
    path: '/auth/login',
    method: 'POST',
    requestHeaders: ['content-type'],
  },
  {
    name: 'authenticated JSON POST',
    path: '/chat',
    method: 'POST',
    requestHeaders: ['authorization', 'content-type'],
  },
  {
    name: 'authenticated JSON PATCH',
    path: '/auth/profile',
    method: 'PATCH',
    requestHeaders: ['authorization', 'content-type'],
  },
  {
    name: 'authenticated DELETE',
    path: '/cart/items/item-123',
    method: 'DELETE',
    requestHeaders: ['authorization'],
  },
  {
    name: 'raw authenticated profile-image upload',
    path: '/auth/profile-image',
    method: 'POST',
    requestHeaders: ['authorization', 'content-type', 'x-filename'],
  },
  {
    name: 'visitor voice chat with optional context',
    path: '/voice-chat',
    method: 'POST',
    requestHeaders: [
      'content-type',
      'x-conversation-context',
      'x-conversation-id',
      'x-customer-context',
      'x-filename',
      'x-response-mode',
      'x-role',
    ],
  },
  {
    name: 'authenticated voice chat with optional context',
    path: '/voice-chat',
    method: 'POST',
    requestHeaders: [
      'authorization',
      'content-type',
      'x-conversation-context',
      'x-conversation-id',
      'x-customer-context',
      'x-filename',
      'x-response-mode',
      'x-role',
    ],
  },
];

function commaSeparatedHeaderNames(value) {
  return String(value || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
}

await jest.unstable_mockModule('dotenv', () => ({
  default: {
    config: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: app } = await import('../src/api/app.js');
const { sanitizeRequestValue } = await import('../src/api/middleware/security.middleware.js');

describe('security middleware', () => {
  it('sets helmet security headers and allows configured CORS origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://app.example.com');

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(commaSeparatedHeaderNames(res.headers['access-control-allow-headers']))
      .toEqual(EXPECTED_DEFAULT_ALLOWED_HEADERS.map((header) => header.toLowerCase()));
    expect(commaSeparatedHeaderNames(res.headers['access-control-allow-methods']))
      .toEqual(EXPECTED_ALLOWED_METHODS.map((method) => method.toLowerCase()));
    expect(res.headers['access-control-expose-headers']).toBe('X-AI-Trace-Id');
    expect(res.headers.vary).toContain('Origin');
  });

  it.each(BROWSER_PREFLIGHT_CASES)(
    'allows browser preflight for $name',
    async ({ path, method, requestHeaders }) => {
      const res = await request(app)
        .options(path)
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', method)
        .set('Access-Control-Request-Headers', requestHeaders.join(', '));

      const allowedMethods = commaSeparatedHeaderNames(
        res.headers['access-control-allow-methods']
      ).map((allowedMethod) => allowedMethod.toUpperCase());
      const allowedHeaders = commaSeparatedHeaderNames(
        res.headers['access-control-allow-headers']
      );

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(allowedMethods).toContain(method);
      expect(allowedHeaders).toEqual(expect.arrayContaining(requestHeaders));
    }
  );

  it('allows additional comma-separated CORS origins after trimming whitespace', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://admin.example.com');

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://admin.example.com');
  });

  it('rejects disallowed CORS origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com');

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('CORS_ORIGIN_DENIED');
  });

  it('preserves valid requests without an origin header', async () => {
    const res = await request(app)
      .get('/health');

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sanitizes prototype pollution keys and null bytes', () => {
    const sanitized = sanitizeRequestValue({
      name: 'Ana\0',
      nested: {
        safe: true,
        constructor: { prototype: { polluted: true } },
      },
      list: [
        'quetzal\0',
        { prototype: { polluted: true }, species: 'toucan' },
      ],
    });

    expect(sanitized).toEqual({
      name: 'Ana',
      nested: {
        safe: true,
      },
      list: [
        'quetzal',
        { species: 'toucan' },
      ],
    });
  });
});
