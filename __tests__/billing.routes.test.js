import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockSimulatePayment = jest.fn();
const mockGetFeatureEconomics = jest.fn();

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
  },
}));

await jest.unstable_mockModule('../src/services/billing.service.js', () => ({
  default: {
    createCheckoutSession: jest.fn(),
    createCustomerPortalSession: jest.fn(),
    handleWebhook: jest.fn(),
    getAdminDashboard: jest.fn(),
    getFeatureEconomics: mockGetFeatureEconomics,
    simulatePayment: mockSimulatePayment,
  },
}));

await jest.unstable_mockModule('../src/services/usage.service.js', () => ({
  default: {
    getMonthlyDashboard: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: billingRoutes } = await import('../src/api/routes/billing.routes.js');
const { default: errorMiddleware } = await import('../src/api/middleware/error.middleware.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/billing', billingRoutes);
  app.use(errorMiddleware);
  return app;
}

function authHeader(role = 'admin') {
  const token = jwt.sign(
    {
      email: `${role}@example.com`,
      role,
    },
    'test-jwt-secret',
    {
      subject: role === 'admin' ? '1' : '2',
      expiresIn: '1h',
    }
  );

  return `Bearer ${token}`;
}

describe('billing routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatePayment.mockResolvedValue({
      simulated: true,
      action: 'renewal',
      userId: 7,
      plan: 'PRO',
      status: 'active',
    });
    mockGetFeatureEconomics.mockResolvedValue({
      granularity: 'daily',
      totals: {
        usage: 10,
        aiCost: 3,
        subscriptionRevenue: 40,
        estimatedContributionMargin: 37,
      },
      buckets: [],
    });
  });

  it('requires authentication for billing payment simulation', async () => {
    const response = await request(buildApp())
      .post('/billing/admin/simulate-payment')
      .send({ userId: 7, action: 'renewal' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
      },
    });
    expect(mockSimulatePayment).not.toHaveBeenCalled();
  });

  it('rejects non-admin users for billing payment simulation', async () => {
    const response = await request(buildApp())
      .post('/billing/admin/simulate-payment')
      .set('Authorization', authHeader('customer'))
      .send({ userId: 7, action: 'renewal' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
      },
    });
    expect(mockSimulatePayment).not.toHaveBeenCalled();
  });

  it('allows admin users to simulate billing payments', async () => {
    const payload = {
      userId: 7,
      action: 'renewal',
      plan: 'PRO',
      amountPaid: 2900,
    };

    const response = await request(buildApp())
      .post('/billing/admin/simulate-payment')
      .set('Authorization', authHeader('admin'))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        simulated: true,
        action: 'renewal',
        userId: 7,
        plan: 'PRO',
        status: 'active',
      },
      meta: {},
    });
    expect(mockSimulatePayment).toHaveBeenCalledWith(payload);
  });

  it('restricts feature economics to admins and forwards aggregation filters', async () => {
    const customerResponse = await request(buildApp())
      .get('/billing/admin/feature-economics?granularity=daily')
      .set('Authorization', authHeader('customer'));

    expect(customerResponse.status).toBe(403);
    expect(mockGetFeatureEconomics).not.toHaveBeenCalled();

    const adminResponse = await request(buildApp())
      .get('/billing/admin/feature-economics')
      .query({
        granularity: 'daily',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-07-03T00:00:00.000Z',
      })
      .set('Authorization', authHeader('admin'));

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toMatchObject({
      granularity: 'daily',
      totals: {
        estimatedContributionMargin: 37,
      },
    });
    expect(mockGetFeatureEconomics).toHaveBeenCalledWith({
      granularity: 'daily',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-03T00:00:00.000Z',
    });
  });
});
