import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockGetJobStatus = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/jobStatus.service.js', () => ({
  default: {
    getJobStatus: mockGetJobStatus,
  },
}));

await jest.unstable_mockModule('../src/services/birdIdentificationJob.service.js', () => ({
  default: {
    enqueueIdentification: jest.fn(),
  },
}));

const { default: app } = await import('../src/api/app.js');

function authHeader() {
  const token = jwt.sign(
    { email: 'ana@example.com' },
    'test-jwt-secret',
    { subject: '7', expiresIn: '1h' }
  );

  return 'Bearer ' + token;
}

describe('job status endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns completed job results for the authenticated owner', async () => {
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job-123',
      status: 'completed',
      result: {
        status: 'identified',
        bestMatch: {
          commonName: 'Resplendent Quetzal',
        },
      },
    });

    const res = await request(app)
      .get('/jobs/job-123')
      .set('Authorization', authHeader());

    expect(res.statusCode).toBe(200);
    expect(mockGetJobStatus).toHaveBeenCalledWith({
      jobId: 'job-123',
      userId: '7',
    });
    expect(res.body).toEqual({
      success: true,
      data: {
        jobId: 'job-123',
        status: 'completed',
        result: {
          status: 'identified',
          bestMatch: {
            commonName: 'Resplendent Quetzal',
          },
        },
      },
      meta: {},
    });
  });

  it('requires authentication before exposing job status', async () => {
    const res = await request(app)
      .get('/jobs/job-123');

    expect(res.statusCode).toBe(401);
    expect(mockGetJobStatus).not.toHaveBeenCalled();
  });
});
