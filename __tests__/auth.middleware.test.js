import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
  },
}));

const { createAuthMiddleware, requireAdmin } = await import('../src/api/middleware/auth.middleware.js');

describe('auth middleware', () => {
  it('allows admin users through the admin guard', () => {
    const req = {
      user: {
        role: 'admin',
      },
    };
    const next = jest.fn();

    requireAdmin(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects authenticated non-admin users', () => {
    const req = {
      user: {
        role: 'customer',
      },
    };
    const next = jest.fn();

    requireAdmin(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 403,
      code: 'FORBIDDEN',
    }));
  });

  it('rejects suspended users even when their existing JWT is otherwise valid', async () => {
    const token = (await import('jsonwebtoken')).default.sign(
      { email: 'suspended@example.com' },
      'test-jwt-secret',
      { subject: '7', expiresIn: '1h' }
    );
    const middleware = createAuthMiddleware({
      required: true,
      accessRepository: {
        getAccessState: jest.fn().mockResolvedValue({
          id: 7,
          role: 'customer',
          suspended_at: '2026-07-29T12:00:00.000Z',
        }),
      },
    });
    const req = {
      get: jest.fn().mockReturnValue(`Bearer ${token}`),
    };
    const next = jest.fn();

    await middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
    }));
  });
});
