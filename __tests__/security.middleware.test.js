import { jest } from '@jest/globals';
import request from 'supertest';

process.env.CORS_ORIGINS = ' https://app.example.com, https://admin.example.com , ';
process.env.CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Filename',
  'X-Conversation-Id',
  'X-Role',
  'X-Response-Mode',
  'X-Customer-Context',
  'X-Conversation-Context',
].join(', ');

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
    expect(res.headers['access-control-allow-headers']).toBe(process.env.CORS_ALLOWED_HEADERS);
    expect(res.headers.vary).toContain('Origin');
  });

  it('allows configured voice chat CORS request headers during preflight', async () => {
    const res = await request(app)
      .options('/voice-chat')
      .set('Origin', 'https://app.example.com')
      .set(
        'Access-Control-Request-Headers',
        'content-type,x-response-mode,x-conversation-id,x-customer-context,x-conversation-context,x-role,authorization'
      );

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(res.headers['access-control-allow-headers']).toBe(process.env.CORS_ALLOWED_HEADERS);
  });

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
