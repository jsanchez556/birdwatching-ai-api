import { jest } from '@jest/globals';
import {
  HOMEPAGE_WORKFLOWS,
  HomepageJobService,
  SAFE_HOMEPAGE_ERROR,
  formatJobRow,
} from '../src/services/homepageJob.service.js';

describe('HomepageJobService', () => {
  it('persists and enqueues homepage jobs with minimal safe payloads', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn(),
    };
    const service = new HomepageJobService({
      queries,
      queueFactory: () => ({ add }),
      homepage: {},
    });

    const result = await service.enqueueHomepageJob({
      workflow: HOMEPAGE_WORKFLOWS.BIRD_PROFILE,
      params: {
        speciesCode: 'quetz1',
        name: 'Resplendent Quetzal',
      },
      userId: '7',
    });

    expect(result).toEqual({
      jobId: expect.any(String),
      status: 'queued',
    });
    expect(queries.createJob).toHaveBeenCalledWith({
      jobId: result.jobId,
      jobType: 'homepage',
      userId: 7,
      requestParams: {
        workflow: HOMEPAGE_WORKFLOWS.BIRD_PROFILE,
        params: {
          speciesCode: 'quetz1',
          name: 'Resplendent Quetzal',
        },
      },
    });
    expect(add).toHaveBeenCalledWith(
      'homepage',
      {
        jobId: result.jobId,
        workflow: HOMEPAGE_WORKFLOWS.BIRD_PROFILE,
        params: {
          speciesCode: 'quetz1',
          name: 'Resplendent Quetzal',
        },
        userId: 7,
      },
      {
        jobId: result.jobId,
      }
    );
    expect(add.mock.calls[0][1]).not.toHaveProperty('result');
    expect(add.mock.calls[0][1]).not.toHaveProperty('prompt');
  });

  it('marks the persisted job failed when queue enqueue fails', async () => {
    const error = new Error('redis unavailable');
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
    };
    const service = new HomepageJobService({
      queries,
      queueFactory: () => ({
        add: jest.fn().mockRejectedValue(error),
      }),
      homepage: {},
    });

    await expect(service.enqueueHomepageJob({
      workflow: HOMEPAGE_WORKFLOWS.FEATURED_TOURS,
    })).rejects.toThrow('redis unavailable');

    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      errorMessage: SAFE_HOMEPAGE_ERROR,
    });
  });

  it('formats completed, failed, and not found rows for polling', () => {
    expect(formatJobRow(null)).toEqual({
      status: 'not_found',
    });
    expect(formatJobRow({
      job_id: 'job-1',
      status: 'completed',
      result: {
        tours: [],
      },
    })).toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: {
        tours: [],
      },
    });
    expect(formatJobRow({
      job_id: 'job-2',
      status: 'failed',
    })).toEqual({
      jobId: 'job-2',
      status: 'failed',
      error: {
        message: SAFE_HOMEPAGE_ERROR,
      },
    });
  });

  it('loads public homepage job status through the shared owner-aware query', async () => {
    const queries = {
      getJob: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        status: 'completed',
        result: {
          tours: [],
        },
      }),
    };
    const service = new HomepageJobService({
      queries,
      queueFactory: jest.fn(),
      homepage: {},
    });

    await expect(service.getJobStatus({
      jobId: 'job-1',
      userId: null,
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: {
        tours: [],
      },
    });
    expect(queries.getJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: null,
      jobType: 'homepage',
      allowPublic: true,
    });
  });

  it('runs homepage workflows through the existing homepage service', async () => {
    const homepage = {
      getFeaturedTours: jest.fn().mockResolvedValue([{ id: 'tour-1' }]),
      getBirdHighlights: jest.fn().mockResolvedValue([{ speciesCode: 'quetz1' }]),
      getBirdProfile: jest.fn().mockResolvedValue({ speciesCode: 'quetz1' }),
    };
    const service = new HomepageJobService({
      queries: {},
      queueFactory: jest.fn(),
      homepage,
    });

    await expect(service.processHomepageWorkflow({
      workflow: HOMEPAGE_WORKFLOWS.FEATURED_TOURS,
    })).resolves.toEqual({
      tours: [{ id: 'tour-1' }],
    });
    await expect(service.processHomepageWorkflow({
      workflow: HOMEPAGE_WORKFLOWS.BIRD_HIGHLIGHTS,
    })).resolves.toEqual({
      birds: [{ speciesCode: 'quetz1' }],
    });
    await expect(service.processHomepageWorkflow({
      workflow: HOMEPAGE_WORKFLOWS.BIRD_PROFILE,
      params: { speciesCode: 'quetz1' },
    })).resolves.toEqual({
      bird: { speciesCode: 'quetz1' },
    });
    expect(homepage.getBirdProfile).toHaveBeenCalledWith({
      speciesCode: 'quetz1',
      name: undefined,
    });
  });

  it('persists active, completed, and failed lifecycle transitions', async () => {
    const queries = {
      markActive: jest.fn().mockResolvedValue({ status: 'active' }),
      completeJob: jest.fn().mockResolvedValue({ status: 'completed' }),
      failJob: jest.fn().mockResolvedValue({ status: 'failed' }),
    };
    const service = new HomepageJobService({
      queries,
      queueFactory: jest.fn(),
      homepage: {},
    });

    await service.markActive({ jobId: 'job-1' });
    await service.completeJob({
      jobId: 'job-1',
      result: { tours: [] },
    });
    await service.failJob({ jobId: 'job-1' });

    expect(queries.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(queries.completeJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      result: { tours: [] },
    });
    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorMessage: SAFE_HOMEPAGE_ERROR,
    });
  });
});
