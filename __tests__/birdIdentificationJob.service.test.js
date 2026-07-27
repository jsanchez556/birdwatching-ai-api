import { jest } from '@jest/globals';
import {
  BirdIdentificationJobService,
  SAFE_BIRD_IDENTIFICATION_ERROR,
  formatJobRow,
  isStalledJob,
  splitIdentificationResult,
} from '../src/services/birdIdentificationJob.service.js';

describe('BirdIdentificationJobService', () => {
  it('uploads raw images before enqueueing and stores only the image URL in the job payload', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const analyticsClient = {
      track: jest.fn(),
    };
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn(),
    };
    const imageStorage = {
      uploadIdentificationImage: jest.fn().mockResolvedValue({
        imageUrl: 'https://cdn.example.test/bird-identification/upload.jpg',
      }),
    };
    const service = new BirdIdentificationJobService({
      queries,
      imageStorage,
      queueFactory: () => ({ add }),
      analyticsClient,
    });
    const imageUpload = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimeType: 'image/jpeg',
      filename: 'bird.jpg',
    };

    const result = await service.enqueueIdentification({
      imageUpload,
      userId: '7',
      metadata: {
        parentTraceId: 'trace-1',
        debug: true,
      },
    });

    expect(result).toEqual({
      jobId: expect.any(String),
      status: 'queued',
    });
    expect(imageStorage.uploadIdentificationImage).toHaveBeenCalledWith({
      imageUpload,
      userId: 7,
    });
    expect(queries.createJob).toHaveBeenCalledWith({
      jobId: result.jobId,
      jobType: 'bird-identification',
      userId: 7,
      requestParams: {
        imageUrl: 'https://cdn.example.test/bird-identification/upload.jpg',
      },
    });
    expect(add).toHaveBeenCalledWith(
      'bird-identification',
      {
        jobId: result.jobId,
        imageUrl: 'https://cdn.example.test/bird-identification/upload.jpg',
        userId: 7,
        metadata: {
          parentTraceId: 'trace-1',
          debug: true,
          source: 'upload',
        },
      },
      {
        jobId: result.jobId,
      }
    );
    expect(add.mock.calls[0][1]).not.toHaveProperty('imageUpload');
    expect(add.mock.calls[0][1]).not.toHaveProperty('buffer');
    expect(analyticsClient.track).toHaveBeenCalledWith({
      userId: 7,
      event: 'bird_identification_started',
      idempotencyKey: result.jobId,
      properties: {
        model: expect.stringMatching(/^gpt-/),
        source: 'upload',
      },
    });
  });

  it('marks the persisted job failed when queue enqueue fails', async () => {
    const error = new Error('redis unavailable');
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
    };
    const service = new BirdIdentificationJobService({
      queries,
      imageStorage: {},
      queueFactory: () => ({
        add: jest.fn().mockRejectedValue(error),
      }),
    });

    await expect(service.enqueueIdentification({
      imageUrl: 'https://example.test/bird.jpg',
      userId: 7,
    })).rejects.toThrow('redis unavailable');

    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
    });
  });

  it('formats completed, failed, and not found job rows for polling', () => {
    expect(formatJobRow(null)).toEqual({
      status: 'not_found',
    });
    expect(formatJobRow({
      job_id: 'job-1',
      status: 'completed',
      result: {
        status: 'identified',
      },
    })).toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: {
        status: 'identified',
      },
    });
    expect(formatJobRow({
      job_id: 'job-2',
      status: 'failed',
    })).toEqual({
      jobId: 'job-2',
      status: 'failed',
      error: {
        message: SAFE_BIRD_IDENTIFICATION_ERROR,
      },
    });
  });

  it('returns queued and active job lifecycle states for polling', async () => {
    const updatedAt = new Date();
    const queries = {
      getJob: jest.fn()
        .mockResolvedValueOnce({
          job_id: 'job-1',
          status: 'queued',
          updated_at: updatedAt,
        })
        .mockResolvedValueOnce({
          job_id: 'job-1',
          status: 'active',
          updated_at: updatedAt,
        }),
    };
    const service = new BirdIdentificationJobService({
      queries,
      imageStorage: {},
      queueFactory: jest.fn(),
      stallTimeoutMs: 60_000,
    });

    await expect(service.getJobStatus({
      jobId: 'job-1',
      userId: '7',
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'queued',
    });
    await expect(service.getJobStatus({
      jobId: 'job-1',
      userId: 7,
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'active',
    });
    expect(queries.getJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: 7,
      jobType: 'bird-identification',
    });
  });

  it('marks stale queued jobs failed so polling can stop when workers are unavailable', async () => {
    const queries = {
      getJob: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        status: 'queued',
        updated_at: new Date(Date.now() - 120_000),
      }),
      failJob: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        status: 'failed',
        error_message: SAFE_BIRD_IDENTIFICATION_ERROR,
      }),
    };
    const service = new BirdIdentificationJobService({
      queries,
      imageStorage: {},
      queueFactory: jest.fn(),
      stallTimeoutMs: 60_000,
    });

    await expect(service.getJobStatus({
      jobId: 'job-1',
      userId: 7,
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: {
        message: SAFE_BIRD_IDENTIFICATION_ERROR,
      },
    });
    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
    });
  });

  it('detects stalled queued or active jobs from their last update time', () => {
    const now = Date.parse('2026-06-16T12:00:00.000Z');

    expect(isStalledJob({
      status: 'queued',
      updated_at: new Date(now - 61_000),
    }, 60_000, now)).toBe(true);
    expect(isStalledJob({
      status: 'active',
      updated_at: new Date(now - 30_000),
    }, 60_000, now)).toBe(false);
    expect(isStalledJob({
      status: 'completed',
      updated_at: new Date(now - 120_000),
    }, 60_000, now)).toBe(false);
  });

  it('persists active, completed, and failed job lifecycle transitions', async () => {
    const analyticsClient = {
      track: jest.fn(),
    };
    const queries = {
      markActive: jest.fn().mockResolvedValue({ status: 'active' }),
      getJobForProcessing: jest.fn().mockResolvedValue({
        user_id: 7,
        created_at: new Date(Date.now() - 1000),
        request_params: {
          imageUrl: 'https://example.test/bird.jpg',
        },
      }),
      completeJob: jest.fn().mockResolvedValue({ status: 'completed' }),
      failJob: jest.fn().mockResolvedValue({ status: 'failed' }),
    };
    const historyQueries = {
      createHistory: jest.fn().mockResolvedValue({ id: 12 }),
    };
    const service = new BirdIdentificationJobService({
      queries,
      historyQueries,
      imageStorage: {},
      queueFactory: jest.fn(),
      analyticsClient,
    });

    await service.markActive({ jobId: 'job-1' });
    await service.completeJob({
      jobId: 'job-1',
      identification: {
        status: 'identified',
        bestMatch: {
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
        },
        promptVersions: {
          birdIdentification: '1.0.0',
        },
      },
      metadata: {
        source: 'upload',
      },
    });
    await service.failJob({ jobId: 'job-1' });

    expect(queries.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(queries.completeJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      result: {
        status: 'identified',
        bestMatch: {
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
        },
      },
      meta: {
        promptVersions: {
          birdIdentification: '1.0.0',
        },
        model: undefined,
        ragTrace: undefined,
      },
    });
    expect(historyQueries.createHistory).toHaveBeenCalledWith({
      userId: 7,
      imageUrl: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91,
      result: {
        status: 'identified',
        bestMatch: {
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
        },
      },
      meta: {
        promptVersions: {
          birdIdentification: '1.0.0',
        },
        model: undefined,
        ragTrace: undefined,
      },
    });
    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorMessage: SAFE_BIRD_IDENTIFICATION_ERROR,
    });
    expect(analyticsClient.track).toHaveBeenCalledWith({
      userId: 7,
      event: 'bird_identification_completed',
      idempotencyKey: 'job-1',
      properties: {
        latencyMs: expect.any(Number),
        model: expect.stringMatching(/^gpt-/),
        ragUsed: false,
        source: 'upload',
        status: 'identified',
      },
    });
  });

  it('splits provider and tracing metadata from stored public results', () => {
    expect(splitIdentificationResult({
      status: 'identified',
      bestMatch: {
        commonName: 'Resplendent Quetzal',
      },
      promptVersions: {
        birdIdentification: '1.0.0',
      },
      model: 'gpt-4o',
      providerRequestId: 'provider-1',
      ragTrace: {
        sourceCount: 1,
      },
    })).toEqual({
      result: {
        status: 'identified',
        bestMatch: {
          commonName: 'Resplendent Quetzal',
        },
      },
      meta: {
        promptVersions: {
          birdIdentification: '1.0.0',
        },
        model: 'gpt-4o',
        ragTrace: {
          sourceCount: 1,
        },
      },
    });
  });
});
