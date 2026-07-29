import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const checkReadiness = jest.fn();

await jest.unstable_mockModule('../src/services/dependencyHealth.service.js', () => ({
  default: checkReadiness,
}));

const { default: healthRoutes } = await import('../src/api/routes/health.routes.js');

const app = express();
app.use('/health', healthRoutes);

describe('health routes', () => {
  beforeEach(() => checkReadiness.mockReset());

  test.each(['/health', '/health/live'])('%s is dependency-free liveness', async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', role: 'api' },
      meta: {},
    });
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  test('readiness returns 200 for healthy dependencies', async () => {
    checkReadiness.mockResolvedValue({
      status: 'ok',
      checks: {
        postgres: { status: 'ok' },
        redis: { status: 'ok' },
      },
    });

    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('readiness returns 503 with a stable safe degraded schema', async () => {
    checkReadiness.mockResolvedValue({
      status: 'unavailable',
      checks: {
        postgres: { status: 'unavailable', reason: 'timeout' },
        redis: { status: 'unavailable', reason: 'error' },
      },
    });

    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      data: {
        status: 'unavailable',
        role: 'api',
        checks: {
          postgres: { status: 'unavailable', reason: 'timeout' },
          redis: { status: 'unavailable', reason: 'error' },
        },
      },
      meta: {},
    });
  });
});
