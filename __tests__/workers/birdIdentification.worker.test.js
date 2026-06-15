import { jest } from '@jest/globals';
import { createBirdIdentificationProcessor } from '../../src/workers/birdIdentification.worker.js';

describe('bird identification worker', () => {
  it('runs the existing bird identification service and stores the completed result', async () => {
    const identification = {
      status: 'identified',
      bestMatch: {
        commonName: 'Resplendent Quetzal',
      },
    };
    const identificationService = {
      identifyFromImage: jest.fn().mockResolvedValue(identification),
    };
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      completeJob: jest.fn().mockResolvedValue(undefined),
      failJob: jest.fn(),
    };
    const processor = createBirdIdentificationProcessor({
      identificationService,
      jobService,
    });

    await expect(processor({
      id: 'job-1',
      name: 'bird-identification',
      data: {
        jobId: 'job-1',
        imageUrl: 'https://cdn.example.test/bird.jpg',
        userId: 7,
        metadata: {
          parentTraceId: 'trace-1',
        },
      },
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'completed',
    });

    expect(jobService.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(identificationService.identifyFromImage).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.test/bird.jpg',
      userId: 7,
      metadata: {
        parentTraceId: 'trace-1',
        jobId: 'job-1',
      },
    });
    expect(jobService.completeJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      identification,
    });
    expect(jobService.failJob).not.toHaveBeenCalled();
  });

  it('marks the job failed and rethrows when processing fails', async () => {
    const error = new Error('provider unavailable');
    const identificationService = {
      identifyFromImage: jest.fn().mockRejectedValue(error),
    };
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createBirdIdentificationProcessor({
      identificationService,
      jobService,
    });

    await expect(processor({
      id: 'job-1',
      name: 'bird-identification',
      data: {
        jobId: 'job-1',
        imageUrl: 'https://cdn.example.test/bird.jpg',
        userId: 7,
      },
    })).rejects.toThrow('provider unavailable');

    expect(jobService.failJob).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(jobService.completeJob).not.toHaveBeenCalled();
  });

  it('does not mark retryable bird identification failures failed before the final attempt', async () => {
    const error = new Error('provider unavailable');
    const identificationService = {
      identifyFromImage: jest.fn().mockRejectedValue(error),
    };
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createBirdIdentificationProcessor({
      identificationService,
      jobService,
    });

    await expect(processor({
      id: 'job-1',
      name: 'bird-identification',
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
      data: {
        jobId: 'job-1',
        imageUrl: 'https://cdn.example.test/bird.jpg',
        userId: 7,
      },
    })).rejects.toThrow('provider unavailable');

    expect(jobService.failJob).not.toHaveBeenCalled();
    expect(jobService.completeJob).not.toHaveBeenCalled();
  });

  it('marks retryable bird identification failures failed on the final attempt', async () => {
    const error = new Error('provider unavailable');
    const identificationService = {
      identifyFromImage: jest.fn().mockRejectedValue(error),
    };
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createBirdIdentificationProcessor({
      identificationService,
      jobService,
    });

    await expect(processor({
      id: 'job-1',
      name: 'bird-identification',
      attemptsMade: 2,
      opts: {
        attempts: 3,
      },
      data: {
        jobId: 'job-1',
        imageUrl: 'https://cdn.example.test/bird.jpg',
        userId: 7,
      },
    })).rejects.toThrow('provider unavailable');

    expect(jobService.failJob).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(jobService.completeJob).not.toHaveBeenCalled();
  });

  it('rejects malformed bird identification jobs without retrying', async () => {
    const processor = createBirdIdentificationProcessor({
      identificationService: {
        identifyFromImage: jest.fn(),
      },
      jobService: {
        markActive: jest.fn(),
        completeJob: jest.fn(),
        failJob: jest.fn(),
      },
    });

    await expect(processor({
      name: 'other',
      data: {
        jobId: 'job-1',
        imageUrl: 'https://cdn.example.test/bird.jpg',
        userId: 7,
      },
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Unsupported bird identification job: other',
    });

    await expect(processor({
      id: 'job-1',
      name: 'bird-identification',
      data: {},
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Bird identification job payload is invalid',
    });
  });
});
