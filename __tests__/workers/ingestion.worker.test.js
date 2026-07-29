import { jest } from '@jest/globals';
import { createIngestionProcessor } from '../../src/workers/ingestion.worker.js';

describe('ingestion worker', () => {
  it('processes ingestion jobs through the document ingestion service', async () => {
    const ingestionService = {
      processIngestion: jest.fn().mockResolvedValue({
        jobId: 'job-1',
        status: 'completed',
      }),
    };
    const processor = createIngestionProcessor({ ingestionService });

    await expect(processor({
      id: 'job-1',
      name: 'ingestion',
      data: {
        jobId: 'job-1',
      },
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'completed',
    });

    expect(ingestionService.processIngestion).toHaveBeenCalledWith({
      jobId: 'job-1',
      finalAttempt: true,
    });
  });

  it('passes non-final retry state to the ingestion service', async () => {
    const ingestionService = {
      processIngestion: jest.fn().mockResolvedValue({
        jobId: 'job-1',
      }),
    };
    const processor = createIngestionProcessor({ ingestionService });

    await processor({
      id: 'job-1',
      name: 'ingestion',
      attemptsMade: 1,
      opts: {
        attempts: 3,
      },
      data: {
        jobId: 'job-1',
      },
    });

    expect(ingestionService.processIngestion).toHaveBeenCalledWith({
      jobId: 'job-1',
      finalAttempt: false,
    });
  });

  it('rejects unsupported jobs and invalid payloads', async () => {
    const processor = createIngestionProcessor({
      ingestionService: {
        processIngestion: jest.fn(),
      },
    });

    await expect(processor({
      name: 'other',
      data: {
        jobId: 'job-1',
      },
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Unsupported ingestion job: other',
    });
    await expect(processor({
      name: 'ingestion',
      data: {},
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Ingestion job payload is invalid',
    });
  });
});
