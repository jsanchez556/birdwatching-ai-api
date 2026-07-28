import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const adminMethods = [
  'getOverview',
  'getUsers',
  'getSubscriptions',
  'getAiUsage',
  'getAiCosts',
  'getReservations',
  'getQueueHealth',
  'getFailures',
];
const adminServiceMock = Object.fromEntries(adminMethods.map((method) => [method, jest.fn()]));

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
  },
}));

await jest.unstable_mockModule('../src/admin/admin.service.js', () => ({
  default: adminServiceMock,
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: adminRoutes } = await import('../src/admin/admin.routes.js');
const { default: errorMiddleware } = await import('../src/api/middleware/error.middleware.js');

const endpoints = [
  ['/admin/overview', 'getOverview'],
  ['/admin/users', 'getUsers'],
  ['/admin/subscriptions', 'getSubscriptions'],
  ['/admin/ai-usage', 'getAiUsage'],
  ['/admin/ai-costs', 'getAiCosts'],
  ['/admin/reservations', 'getReservations'],
  ['/admin/queue-health', 'getQueueHealth'],
  ['/admin/failures', 'getFailures'],
];

function buildApp() {
  const app = express();
  app.use('/admin', adminRoutes);
  app.use(errorMiddleware);
  return app;
}

function authHeader(role) {
  const token = jwt.sign(
    { email: `${role}@example.com`, role },
    'test-jwt-secret',
    { subject: role === 'admin' ? '1' : '2', expiresIn: '1h' }
  );
  return `Bearer ${token}`;
}

describe('admin routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of adminMethods) {
      adminServiceMock[method].mockResolvedValue(
        ['getUsers', 'getSubscriptions', 'getReservations', 'getFailures'].includes(method)
          ? { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } }
          : {}
      );
    }
  });

  it.each(endpoints)('returns 401 for unauthenticated GET %s', async (path, method) => {
    const response = await request(buildApp()).get(path);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(adminServiceMock[method]).not.toHaveBeenCalled();
  });

  it.each(endpoints)('returns 403 for non-admin GET %s', async (path, method) => {
    const response = await request(buildApp())
      .get(path)
      .set('Authorization', authHeader('customer'));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(adminServiceMock[method]).not.toHaveBeenCalled();
  });

  it.each(endpoints)('returns 200 for admin GET %s', async (path, method) => {
    const response = await request(buildApp())
      .get(path)
      .query({ page: 2, limit: 10 })
      .set('Authorization', authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(adminServiceMock[method]).toHaveBeenCalledTimes(1);
  });

  it('forwards query parameters through the controller to list services', async () => {
    await request(buildApp())
      .get('/admin/users?page=2&limit=10')
      .set('Authorization', authHeader('admin'));

    expect(adminServiceMock.getUsers).toHaveBeenCalledWith(expect.objectContaining({
      page: '2',
      limit: '10',
    }));
  });

  it('forwards date ranges through the overview controller', async () => {
    await request(buildApp())
      .get('/admin/overview?startDate=2026-07-01&endDate=2026-07-02')
      .set('Authorization', authHeader('admin'));

    expect(adminServiceMock.getOverview).toHaveBeenCalledWith(expect.objectContaining({
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    }));
  });

  it('masks unexpected service failures', async () => {
    adminServiceMock.getOverview.mockRejectedValue(new Error('database password=secret'));

    const response = await request(buildApp())
      .get('/admin/overview')
      .set('Authorization', authHeader('admin'));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
