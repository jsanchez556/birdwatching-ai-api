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
  'getAiQuality',
  'getReservations',
  'getQueueHealth',
  'getFailures',
  'getErrors',
];
const adminServiceMock = Object.fromEntries(adminMethods.map((method) => [method, jest.fn()]));
const adminOperationsServiceMock = {
  retryFailedJob: jest.fn(),
  suspendUser: jest.fn(),
  disableAiFeature: jest.fn(),
  enableAiFeature: jest.fn(),
  unsuspendUser: jest.fn(),
};

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
  },
}));

await jest.unstable_mockModule('../src/services/admin/admin.service.js', () => ({
  default: adminServiceMock,
}));

await jest.unstable_mockModule('../src/services/admin/adminOperations.service.js', () => ({
  default: adminOperationsServiceMock,
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: adminRoutes } = await import('../src/api/routes/admin.routes.js');
const { default: errorMiddleware } = await import('../src/api/middleware/error.middleware.js');

const endpoints = [
  ['/admin/overview', 'getOverview'],
  ['/admin/users', 'getUsers'],
  ['/admin/subscriptions', 'getSubscriptions'],
  ['/admin/ai-usage', 'getAiUsage'],
  ['/admin/ai-costs', 'getAiCosts'],
  ['/admin/ai-quality', 'getAiQuality'],
  ['/admin/reservations', 'getReservations'],
  ['/admin/queue-health', 'getQueueHealth'],
  ['/admin/failures', 'getFailures'],
  ['/admin/errors', 'getErrors'],
];

function buildApp() {
  const app = express();
  app.use(express.json());
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
        ['getUsers', 'getSubscriptions', 'getReservations', 'getFailures', 'getErrors'].includes(method)
          ? { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } }
          : {}
      );
    }
    adminOperationsServiceMock.retryFailedJob.mockResolvedValue({
      auditId: '1',
      job: { id: 'job-1', status: 'queued' },
    });
    adminOperationsServiceMock.suspendUser.mockResolvedValue({
      auditId: '2',
      user: { id: '7', status: 'suspended' },
    });
    adminOperationsServiceMock.disableAiFeature.mockResolvedValue({
      auditId: '3',
      feature: { name: 'voice_ai', status: 'disabled' },
    });
    adminOperationsServiceMock.enableAiFeature.mockResolvedValue({
      auditId: '4',
      feature: { name: 'voice_ai', status: 'enabled', disabledUntil: null },
    });
    adminOperationsServiceMock.unsuspendUser.mockResolvedValue({
      auditId: '5',
      user: { id: '7', status: 'active', suspendedAt: null, reasonCode: null },
    });
  });

  it.each([
    ['/admin/jobs/job-1/retry', {}, 'retryFailedJob'],
    ['/admin/users/7/suspend', { reasonCode: 'abuse' }, 'suspendUser'],
    ['/admin/ai-features/voice_ai/disable', { durationMinutes: 30 }, 'disableAiFeature'],
    ['/admin/ai-features/voice_ai/enable', {}, 'enableAiFeature'],
    ['/admin/users/7/unsuspend', {}, 'unsuspendUser'],
  ])('protects admin operation POST %s', async (path, body, method) => {
    const unauthenticated = await request(buildApp()).post(path).send(body);
    const forbidden = await request(buildApp())
      .post(path)
      .set('Authorization', authHeader('customer'))
      .send(body);
    const success = await request(buildApp())
      .post(path)
      .set('Authorization', authHeader('admin'))
      .send(body);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(success.status).toBe(200);
    expect(success.body).toMatchObject({ success: true, meta: {} });
    expect(adminOperationsServiceMock[method]).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed admin operation payloads before service execution', async () => {
    const response = await request(buildApp())
      .post('/admin/ai-features/voice_ai/disable')
      .set('Authorization', authHeader('admin'))
      .send({ durationMinutes: 0, secret: 'must-not-pass' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(adminOperationsServiceMock.disableAiFeature).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('must-not-pass');
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

  it('protects and returns current AI feature state', async () => {
    adminOperationsServiceMock.getAiFeatureStates = jest.fn().mockResolvedValue({ features: [] });
    expect((await request(buildApp()).get('/admin/ai-features')).status).toBe(401);
    expect((await request(buildApp()).get('/admin/ai-features')
      .set('Authorization', authHeader('customer'))).status).toBe(403);
    const response = await request(buildApp()).get('/admin/ai-features')
      .set('Authorization', authHeader('admin'));
    expect(response.body).toEqual({ success: true, data: { features: [] }, meta: {} });
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

  it('returns the normalized AI quality envelope and forwards only its date range', async () => {
    adminServiceMock.getAiQuality.mockResolvedValueOnce({
      range: {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-08-01T00:00:00.000Z',
        timezone: 'UTC',
      },
      previousRange: {
        startAt: '2026-05-31T00:00:00.000Z',
        endAt: '2026-07-01T00:00:00.000Z',
        timezone: 'UTC',
      },
      metrics: {
        groundingScore: {
          current: 0.86,
          previous: 0.82,
          delta: 0.04,
          currentSampleSize: 120,
          previousSampleSize: 110,
        },
      },
    });

    const response = await request(buildApp())
      .get('/admin/ai-quality?startDate=2026-07-01&endDate=2026-08-01&ignored=value')
      .set('Authorization', authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        range: { timezone: 'UTC' },
        metrics: {
          groundingScore: { current: 0.86 },
        },
      },
      meta: {},
    });
    expect(adminServiceMock.getAiQuality).toHaveBeenCalledWith({
      startDate: '2026-07-01',
      endDate: '2026-08-01',
    });
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

  it('returns the normalized queue-health envelope and masks BullMQ failures', async () => {
    adminServiceMock.getQueueHealth.mockResolvedValueOnce({
      observedAt: '2026-07-28T12:00:00.000Z',
      queues: [{
        id: 'bird-identification',
        name: 'Bird Identification',
        waiting: 4,
        active: 2,
        completed: 120,
        failed: 0,
        delayed: 1,
      }],
    });

    const success = await request(buildApp())
      .get('/admin/queue-health')
      .set('Authorization', authHeader('admin'));

    expect(success.status).toBe(200);
    expect(success.body).toEqual({
      success: true,
      data: {
        observedAt: '2026-07-28T12:00:00.000Z',
        queues: [{
          id: 'bird-identification',
          name: 'Bird Identification',
          waiting: 4,
          active: 2,
          completed: 120,
          failed: 0,
          delayed: 1,
        }],
      },
      meta: {},
    });

    adminServiceMock.getQueueHealth.mockRejectedValueOnce(
      new Error('redis://credential@host must not leak')
    );

    const failure = await request(buildApp())
      .get('/admin/queue-health')
      .set('Authorization', authHeader('admin'));

    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(failure.body)).not.toContain('credential');
  });

  it('returns the operational errors envelope and masks source failures', async () => {
    adminServiceMock.getErrors.mockResolvedValueOnce({
      data: {
        errors: [{
          id: 'error-1',
          timestamp: '2026-07-28T12:00:00.000Z',
          type: 'TOOL_ERROR',
          user: { id: '42', label: 'User 42' },
          traceId: 'trace-1',
          traceUrl: 'https://smith.langchain.com/o/project/r/trace-1',
          message: 'Tool execution failed',
          status: 'failed',
        }],
      },
      meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });

    const success = await request(buildApp())
      .get('/admin/errors?page=1&limit=25&type=TOOL_ERROR')
      .set('Authorization', authHeader('admin'));

    expect(success.status).toBe(200);
    expect(success.body).toEqual({
      success: true,
      data: {
        errors: [expect.objectContaining({
          id: 'error-1',
          type: 'TOOL_ERROR',
        })],
      },
      meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    expect(adminServiceMock.getErrors).toHaveBeenCalledWith(expect.objectContaining({
      page: '1',
      limit: '25',
      type: 'TOOL_ERROR',
    }));

    adminServiceMock.getErrors.mockRejectedValueOnce(new Error('redis://secret'));
    const failure = await request(buildApp())
      .get('/admin/errors')
      .set('Authorization', authHeader('admin'));

    expect(failure.status).toBe(500);
    expect(failure.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(failure.body)).not.toContain('secret');
  });
});
