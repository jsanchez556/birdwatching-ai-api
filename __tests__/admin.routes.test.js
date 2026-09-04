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
  'getContextEngineering',
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
  changeUserRole: jest.fn(),
};
const adminMaintenanceServiceMock = {
  list: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};
const locationSearchServiceMock = { search: jest.fn(), reverse: jest.fn() };
const tourImageServiceMock = { replace: jest.fn() };

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

await jest.unstable_mockModule('../src/services/admin/adminMaintenance.service.js', () => ({
  default: adminMaintenanceServiceMock,
}));

await jest.unstable_mockModule('../src/services/admin/locationSearch.service.js', () => ({
  default: locationSearchServiceMock,
}));

await jest.unstable_mockModule('../src/services/admin/tourImage.service.js', () => ({
  default: tourImageServiceMock,
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
  ['/admin/context-engineering', 'getContextEngineering'],
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
    adminOperationsServiceMock.changeUserRole.mockResolvedValue({
      auditId: '5',
      user: { id: '7', previousRole: 'customer', role: 'tour guide' },
      sessionsRevoked: true,
    });
    adminMaintenanceServiceMock.list.mockResolvedValue({ data: { items: [] }, meta: { page: 1, limit: 25, total: 0, totalPages: 0 } });
    adminMaintenanceServiceMock.getById.mockResolvedValue({ entity: { id: 1, name: 'Costa Rica' } });
    adminMaintenanceServiceMock.create.mockResolvedValue({ entity: { id: 1, name: 'Costa Rica', acr: 'CR' } });
    adminMaintenanceServiceMock.update.mockResolvedValue({ entity: { id: 1, name: 'Costa Rica', acr: 'CR' } });
    adminMaintenanceServiceMock.remove.mockResolvedValue({ entity: { id: 1 }, archived: false });
    locationSearchServiceMock.search.mockResolvedValue([]);
    tourImageServiceMock.replace.mockResolvedValue({
      tour: { id: 7, name: 'Cloud forest walk', imagePath: 'tours/11111111-1111-4111-8111-111111111111.png' },
      image: {
        key: 'tours/11111111-1111-4111-8111-111111111111.png',
        url: '/files/tours/11111111-1111-4111-8111-111111111111.png?v=1788436800000',
        version: '1788436800000',
        cleanupPending: false,
        mimeType: 'image/png',
        size: 12,
      },
    });
  });

  it.each(['countries', 'zones', 'nodes', 'birds', 'birds-by-node', 'tours'])(
    'protects and serves CRUD maintenance routes for %s',
    async (resource) => {
      const authorization = authHeader('admin');
      const id = resource === 'birds-by-node' ? '1:2' : '1';
      const createBody = resource === 'countries'
        ? { name: 'Costa Rica', acr: 'CR', latitude: 9.75, longitude: -84.2, zoom: 7 }
        : resource === 'tours'
          ? { nodeId: 1, name: 'Night forest', type: 'Night walk', price: 90, durationValue: 3, durationUnit: 'hours', maxParticipants: 6, difficulty: 'easy' }
          : resource === 'birds-by-node'
            ? { nodeId: 1, birdId: 2, rank: 1 }
            : resource === 'birds'
              ? { name: 'Resplendent Quetzal' }
              : resource === 'zones'
                ? { countryId: 1, name: 'North', description: 'North zone', rank: 1 }
                : { zoneId: 1, name: 'Forest', rank: 1, lat: 10.1, lon: -84.1 };
      const updateBody = resource === 'countries'
        ? { name: 'Costa Rica updated', latitude: 9.8, longitude: -84.1, zoom: 8 }
        : resource === 'tours'
          ? { type: 'Adventure' }
          : resource === 'birds'
            ? { name: 'Quetzal updated' }
            : { rank: 2 };

      expect((await request(buildApp()).get(`/admin/${resource}`)).status).toBe(401);
      expect((await request(buildApp()).get(`/admin/${resource}`).set('Authorization', authHeader('customer'))).status).toBe(403);
      expect((await request(buildApp()).get(`/admin/${resource}`).set('Authorization', authorization)).status).toBe(200);
      expect((await request(buildApp()).post(`/admin/${resource}`).set('Authorization', authorization).send(createBody)).status).toBe(201);
      expect((await request(buildApp()).patch(`/admin/${resource}/${id}`).set('Authorization', authorization).send(updateBody)).status).toBe(200);
      expect((await request(buildApp()).delete(`/admin/${resource}/${id}`).set('Authorization', authorization).send({})).status).toBe(200);
    }
  );

  it.each([
    [{ latitude: 91 }, 'latitude'],
    [{ longitude: -181 }, 'longitude'],
    [{ zoom: 20 }, 'zoom'],
    [{ zoom: 7.5 }, 'zoom'],
  ])('rejects invalid country viewport values %j', async (viewport, field) => {
    const response = await request(buildApp()).patch('/admin/countries/1')
      .set('Authorization', authHeader('admin'))
      .send(viewport);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.join(' ')).toContain(field);
    expect(adminMaintenanceServiceMock.update).not.toHaveBeenCalled();
  });

  it('exposes country viewport fields through the normalized admin envelope', async () => {
    adminMaintenanceServiceMock.list.mockResolvedValueOnce({
      data: { items: [{ id: 1, name: 'Costa Rica', acr: 'CR', latitude: 9.75, longitude: -84.2, zoom: 7 }] },
      meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    const response = await request(buildApp()).get('/admin/countries')
      .set('Authorization', authHeader('admin'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [{ latitude: 9.75, longitude: -84.2, zoom: 7 }] },
      meta: { page: 1, total: 1 },
    });
  });

  it('rejects invalid tour types and coordinates before maintenance service execution', async () => {
    const response = await request(buildApp()).post('/admin/tours')
      .set('Authorization', authHeader('admin'))
      .send({ nodeId: 1, name: 'Invalid', type: 'Space walk', price: 10, availableSlots: 1, durationHours: 1, difficulty: 'easy', lat: 91 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(adminMaintenanceServiceMock.create).not.toHaveBeenCalled();
  });

  it('applies schedule-specific tour validation and accepts canonical durations', async () => {
    const authorization = authHeader('admin');
    const flexible = {
      nodeId: 1, name: 'Flexible forest', type: 'Birdwatching', price: 80,
      durationValue: 1, durationUnit: 'days', maxParticipants: 6, difficulty: 'easy',
      tourType: 'unscheduled',
    };
    const flexibleResponse = await request(buildApp()).post('/admin/tours')
      .set('Authorization', authorization).send(flexible);
    expect(flexibleResponse.status).toBe(201);

    const invalidScheduled = await request(buildApp()).post('/admin/tours')
      .set('Authorization', authorization).send({
        ...flexible, name: 'Scheduled forest', tourType: 'scheduled', availableSlots: 4,
      });
    expect(invalidScheduled.status).toBe(400);
    expect(invalidScheduled.body.error.details.join(' ')).toContain('startDate');

    const invalidDuration = await request(buildApp()).post('/admin/tours')
      .set('Authorization', authorization).send({ ...flexible, durationValue: 0, durationUnit: 'weeks' });
    expect(invalidDuration.status).toBe(400);
    expect(invalidDuration.body.error.details.join(' ')).toContain('durationUnit');
  });

  it('protects location search and returns normalized results', async () => {
    locationSearchServiceMock.search.mockResolvedValue([
      { name: 'Monteverde', latitude: 10.3, longitude: -84.8 },
    ]);
    expect((await request(buildApp()).get('/admin/location-search?q=Monteverde')).status).toBe(401);
    const response = await request(buildApp()).get('/admin/location-search?q=Monteverde')
      .set('Authorization', authHeader('admin'));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(locationSearchServiceMock.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'Monteverde' }));
  });

  it('protects and accepts one PNG tour image upload', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('test'),
    ]);

    expect((await request(buildApp()).put('/admin/tours/7/image')
      .attach('image', png, { filename: 'tour.png', contentType: 'image/png' })).status).toBe(401);
    expect((await request(buildApp()).put('/admin/tours/7/image')
      .set('Authorization', authHeader('customer'))
      .attach('image', png, { filename: 'tour.png', contentType: 'image/png' })).status).toBe(403);

    const response = await request(buildApp()).put('/admin/tours/7/image')
      .set('Authorization', authHeader('admin'))
      .attach('image', png, { filename: 'tour.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { tour: { imagePath: 'tours/11111111-1111-4111-8111-111111111111.png' }, image: {
        key: 'tours/11111111-1111-4111-8111-111111111111.png',
        url: '/files/tours/11111111-1111-4111-8111-111111111111.png?v=1788436800000',
        version: '1788436800000',
        cleanupPending: false,
      } },
      meta: {},
    });
    expect(tourImageServiceMock.replace).toHaveBeenCalledWith({
      tourId: '7',
      imageUpload: expect.objectContaining({
        buffer: expect.any(Buffer),
        filename: 'tour.png',
        mimeType: 'image/png',
      }),
    });
  });

  it('keeps persisted tour image paths read-only outside the upload endpoint', async () => {
    const authorization = authHeader('admin');
    const response = await request(buildApp()).patch('/admin/tours/7')
      .set('Authorization', authorization)
      .send({ imagePath: 'tours/7.png' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContain('imagePath is not allowed for tours');
    expect(adminMaintenanceServiceMock.update).not.toHaveBeenCalled();
  });

  it('rejects malformed tour image requests before service execution', async () => {
    const authorization = authHeader('admin');
    const invalidId = await request(buildApp()).put('/admin/tours/not-an-id/image')
      .set('Authorization', authorization)
      .attach('image', Buffer.from('image'), { filename: 'tour.png', contentType: 'image/png' });
    const wrongType = await request(buildApp()).put('/admin/tours/7/image')
      .set('Authorization', authorization)
      .attach('image', Buffer.from('image'), { filename: 'tour.jpg', contentType: 'image/jpeg' });
    const missing = await request(buildApp()).put('/admin/tours/7/image')
      .set('Authorization', authorization);

    expect(invalidId.status).toBe(400);
    expect(wrongType.status).toBe(422);
    expect(missing.status).toBe(422);
    expect(tourImageServiceMock.replace).not.toHaveBeenCalled();
  });

  it('protects reverse geocoding and returns one normalized location', async () => {
    locationSearchServiceMock.reverse.mockResolvedValue({
      name: 'San José, Costa Rica', latitude: 9.9325, longitude: -84.0796,
    });
    const response = await request(buildApp())
      .get('/admin/location-search?latitude=9.9325&longitude=-84.0796')
      .set('Authorization', authHeader('admin'));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      { name: 'San José, Costa Rica', latitude: 9.9325, longitude: -84.0796 },
    ]);
    expect(locationSearchServiceMock.reverse).toHaveBeenCalledWith(expect.objectContaining({
      latitude: '9.9325', longitude: '-84.0796',
    }));
  });

  it.each([
    ['/admin/model-routing/preview', { task: 'general_chat' }, 'previewModelRouting'],
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
    if (method !== 'previewModelRouting') {
      expect(adminOperationsServiceMock[method]).toHaveBeenCalledTimes(1);
    }
  });

  it('returns a sanitized model-routing preview for an admin', async () => {
    const response = await request(buildApp())
      .post('/admin/model-routing/preview')
      .set('Authorization', authHeader('admin'))
      .send({
        task: 'reservation_planning',
        estimatedInputTokens: 2200,
        userPlan: 'pro',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        task: 'reservation_planning',
        route: 'advanced',
        reasonCode: 'MULTI_STEP_RESERVATION',
        reason: 'Multi-step reservation workflow',
        primaryModelKey: 'advanced_reasoning',
        fallbackCount: expect.any(Number),
        reasoningEffort: 'medium',
        timeoutMs: 30000,
        maxRetries: 2,
      },
      meta: {},
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /gpt-|OPENAI_|api.?key|authorization|provider.*error/i
    );
  });

  it('rejects invalid routing previews without leaking submitted secrets', async () => {
    const response = await request(buildApp())
      .post('/admin/model-routing/preview')
      .set('Authorization', authHeader('admin'))
      .send({
        task: 'not_a_task',
        estimatedInputTokens: -1,
        userPlan: 'enterprise',
        secret: 'sk-live-must-not-leak',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('sk-live-must-not-leak');
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

  it('protects context telemetry and forwards only the reporting window', async () => {
    adminServiceMock.getContextEngineering.mockResolvedValueOnce({ metrics: {} });
    expect((await request(buildApp()).get('/admin/context-engineering')).status).toBe(401);
    expect((await request(buildApp()).get('/admin/context-engineering')
      .set('Authorization', authHeader('customer'))).status).toBe(403);

    const response = await request(buildApp())
      .get('/admin/context-engineering?startDate=2026-07-01&endDate=2026-08-01&ignored=value')
      .set('Authorization', authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { metrics: {} }, meta: {} });
    expect(adminServiceMock.getContextEngineering).toHaveBeenCalledWith({
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

  it('allows only administrators to change an allowlisted user role', async () => {
    expect((await request(buildApp()).patch('/admin/users/7/role').send({ role: 'tour guide' })).status).toBe(401);
    expect((await request(buildApp()).patch('/admin/users/7/role')
      .set('Authorization', authHeader('customer')).send({ role: 'tour guide' })).status).toBe(403);

    const response = await request(buildApp()).patch('/admin/users/7/role')
      .set('Authorization', authHeader('admin')).send({ role: 'tour guide' });
    expect(response.status).toBe(200);
    expect(adminOperationsServiceMock.changeUserRole).toHaveBeenCalledWith({
      adminUserId: 1, userId: 7, role: 'tour guide',
    });

    const invalid = await request(buildApp()).patch('/admin/users/7/role')
      .set('Authorization', authHeader('admin')).send({ role: 'owner', isAdmin: true });
    expect(invalid.status).toBe(400);
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
