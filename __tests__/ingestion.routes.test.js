import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockEnqueueIngestion = jest.fn();
const mockGetIngestionStatus = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/documentIngestion.service.js', () => ({
  default: {
    enqueueIngestion: mockEnqueueIngestion,
    getIngestionStatus: mockGetIngestionStatus,
  },
}));

await jest.unstable_mockModule('../src/services/birdIdentificationJob.service.js', () => ({
  default: {
    enqueueIdentification: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/jobStatus.service.js', () => ({
  default: {
    getJobStatus: jest.fn(),
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

describe('ingestion routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues JSON document ingestion and returns processing status', async () => {
    mockEnqueueIngestion.mockResolvedValue({
      jobId: 'job-1',
      status: 'processing',
    });

    const res = await request(app)
      .post('/ingestions')
      .set('Authorization', authHeader())
      .send({
        documents: [{
          externalId: 'doc-1',
          name: 'Document One',
          description: 'Bird habitat notes.',
        }],
      });

    expect(res.statusCode).toBe(202);
    expect(mockEnqueueIngestion).toHaveBeenCalledWith({
      body: {
        documents: [{
          externalId: 'doc-1',
          name: 'Document One',
          description: 'Bird habitat notes.',
        }],
      },
      documentUpload: undefined,
      userId: '7',
    });
    expect(res.body).toEqual({
      success: true,
      data: {
        jobId: 'job-1',
        status: 'processing',
      },
      meta: {},
    });
  });

  it('queues raw text uploads', async () => {
    mockEnqueueIngestion.mockResolvedValue({
      jobId: 'upload-job',
      status: 'processing',
    });

    const res = await request(app)
      .post('/ingestions')
      .set('Authorization', authHeader())
      .set('Content-Type', 'text/plain')
      .set('X-Filename', 'notes.txt')
      .send('Cloud forest notes.');

    expect(res.statusCode).toBe(202);
    expect(mockEnqueueIngestion).toHaveBeenCalledWith(expect.objectContaining({
      body: {},
      userId: '7',
      documentUpload: expect.objectContaining({
        buffer: expect.any(Buffer),
        mimeType: 'text/plain',
        filename: 'notes.txt',
      }),
    }));
  });

  it('returns ingestion status for the authenticated owner', async () => {
    mockGetIngestionStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      result: {
        documentCount: 1,
      },
    });

    const res = await request(app)
      .get('/ingestions/job-1')
      .set('Authorization', authHeader());

    expect(res.statusCode).toBe(200);
    expect(mockGetIngestionStatus).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: '7',
    });
    expect(res.body.data).toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: {
        documentCount: 1,
      },
    });
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/ingestions')
      .send({
        text: 'Bird notes.',
      });

    expect(res.statusCode).toBe(401);
    expect(mockEnqueueIngestion).not.toHaveBeenCalled();
  });
});
