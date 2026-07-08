import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
  },
}));

const { requireAdmin } = await import('../src/api/middleware/auth.middleware.js');

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
});
