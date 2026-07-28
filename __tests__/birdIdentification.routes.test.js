import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockEnqueueIdentification = jest.fn();
const mockReserveUsage = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/birdIdentificationJob.service.js', () => ({
  default: {
    enqueueIdentification: mockEnqueueIdentification,
  },
}));

await jest.unstable_mockModule('../src/services/quota.service.js', () => ({
  QUOTA_FEATURES: {
    CHAT: 'chat',
    IDENTIFICATION: 'identification',
  },
  default: {
    reserveUsage: mockReserveUsage,
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

describe('bird identification endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveUsage.mockResolvedValue({
      allowed: true,
      plan: 'FREE',
      feature: 'identification',
      used: 1,
      max: 5,
    });
  });

  it('queues the image URL for async identification and returns a job id', async () => {
    mockEnqueueIdentification.mockResolvedValue({
      jobId: 'job-123',
      status: 'queued',
    });

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(202);
    expect(mockEnqueueIdentification).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.test/bird.jpg',
      imageUpload: undefined,
      userId: '7',
      metadata: expect.objectContaining({
        aiTraceId: res.headers['x-ai-trace-id'],
      }),
    }));
    expect(res.body).toEqual({
      success: true,
      data: {
        jobId: 'job-123',
        status: 'queued',
      },
      meta: {
        aiTraceId: res.headers['x-ai-trace-id'],
      },
    });
    expect(res.headers['x-ai-trace-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('exposes the requested bird-identification alias', async () => {
    mockEnqueueIdentification.mockResolvedValue({
      jobId: 'job-alias',
      status: 'queued',
    });

    const res = await request(app)
      .post('/bird-identification')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(202);
    expect(mockEnqueueIdentification).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.test/bird.jpg',
      imageUpload: undefined,
      userId: '7',
    }));
  });

  it('requires authentication before bird identification', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(401);
    expect(mockEnqueueIdentification).not.toHaveBeenCalled();
  });

  it('returns 429 before enqueueing when daily identification quota is exceeded', async () => {
    const quotaError = new Error('Daily quota exceeded');
    quotaError.status = 429;
    quotaError.code = 'QUOTA_EXCEEDED';
    quotaError.details = {
      plan: 'FREE',
      feature: 'identification',
      used: 5,
      max: 5,
    };
    mockReserveUsage.mockRejectedValue(quotaError);

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Daily quota exceeded',
        details: {
          plan: 'FREE',
          feature: 'identification',
          used: 5,
          max: 5,
        },
      },
    });
    expect(mockEnqueueIdentification).not.toHaveBeenCalled();
  });

  it('accepts authenticated raw image uploads', async () => {
    mockEnqueueIdentification.mockResolvedValue({
      jobId: 'upload-job',
      status: 'queued',
    });

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .set('Content-Type', 'image/jpeg')
      .set('X-Filename', 'bird.jpg')
      .send(Buffer.from([0xff, 0xd8, 0xff]));

    expect(res.statusCode).toBe(202);
    expect(mockEnqueueIdentification).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: undefined,
      userId: '7',
      imageUpload: expect.objectContaining({
        buffer: expect.any(Buffer),
        mimeType: 'image/jpeg',
        filename: 'bird.jpg',
      }),
    }));
    expect(res.body.data).toEqual({
      jobId: 'upload-job',
      status: 'queued',
    });
  });

  it('rejects unsupported authenticated image uploads', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .set('Content-Type', 'text/plain')
      .send('not an image');

    expect(res.statusCode).toBe(422);
    expect(mockEnqueueIdentification).not.toHaveBeenCalled();
  });

  it('rejects invalid image URLs before service execution', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'file:///tmp/bird.jpg', extra: true });

    expect(res.statusCode).toBe(422);
    expect(mockEnqueueIdentification).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'validation_error',
      },
    });
  });
});
