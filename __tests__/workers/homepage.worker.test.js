import { jest } from '@jest/globals';
import { createHomepageProcessor } from '../../src/workers/homepage.worker.js';

describe('homepage worker', () => {
  it('runs the homepage workflow and stores the completed result', async () => {
    const result = {
      tours: [{ id: 'tour-1' }],
    };
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      processHomepageWorkflow: jest.fn().mockResolvedValue(result),
      completeJob: jest.fn().mockResolvedValue(undefined),
      failJob: jest.fn(),
    };
    const processor = createHomepageProcessor({ jobService });

    await expect(processor({
      id: 'job-1',
      name: 'homepage',
      data: {
        jobId: 'job-1',
        workflow: 'featured-tours',
        params: {},
      },
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'completed',
    });

    expect(jobService.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(jobService.processHomepageWorkflow).toHaveBeenCalledWith({
      workflow: 'featured-tours',
      params: {},
    });
    expect(jobService.completeJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      result,
    });
    expect(jobService.failJob).not.toHaveBeenCalled();
  });

  it('does not mark retryable homepage failures failed before the final attempt', async () => {
    const error = new Error('database unavailable');
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      processHomepageWorkflow: jest.fn().mockRejectedValue(error),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createHomepageProcessor({ jobService });

    await expect(processor({
      id: 'job-1',
      name: 'homepage',
      attemptsMade: 1,
      opts: { attempts: 3 },
      data: {
        jobId: 'job-1',
        workflow: 'featured-tours',
      },
    })).rejects.toThrow('database unavailable');

    expect(jobService.failJob).not.toHaveBeenCalled();
    expect(jobService.completeJob).not.toHaveBeenCalled();
  });

  it('marks homepage failures failed on the final attempt', async () => {
    const error = new Error('database unavailable');
    const jobService = {
      markActive: jest.fn().mockResolvedValue(undefined),
      processHomepageWorkflow: jest.fn().mockRejectedValue(error),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createHomepageProcessor({ jobService });

    await expect(processor({
      id: 'job-1',
      name: 'homepage',
      attemptsMade: 2,
      opts: { attempts: 3 },
      data: {
        jobId: 'job-1',
        workflow: 'featured-tours',
      },
    })).rejects.toThrow('database unavailable');

    expect(jobService.failJob).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(jobService.completeJob).not.toHaveBeenCalled();
  });

  it('rejects malformed homepage jobs without retrying', async () => {
    const processor = createHomepageProcessor({
      jobService: {
        markActive: jest.fn(),
        processHomepageWorkflow: jest.fn(),
        completeJob: jest.fn(),
        failJob: jest.fn(),
      },
    });

    await expect(processor({
      name: 'other',
      data: {
        jobId: 'job-1',
        workflow: 'featured-tours',
      },
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Unsupported homepage job: other',
    });

    await expect(processor({
      id: 'job-1',
      name: 'homepage',
      data: {},
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Homepage job payload is invalid',
    });
  });
});
