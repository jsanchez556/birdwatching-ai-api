import { jest } from '@jest/globals';
import {
  JobStatusService,
  formatJobRow,
} from '../src/services/jobStatus.service.js';

describe('JobStatusService', () => {
  it('loads jobs through the shared owner-aware jobs query', async () => {
    const queries = {
      getJob: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        job_type: 'bird-identification',
        status: 'completed',
        result: {
          status: 'identified',
        },
      }),
    };
    const service = new JobStatusService({ queries });

    await expect(service.getJobStatus({
      jobId: 'job-1',
      userId: 7,
    })).resolves.toEqual({
      jobId: 'job-1',
      jobType: 'bird-identification',
      status: 'completed',
      result: {
        status: 'identified',
      },
    });
    expect(queries.getJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: 7,
    });
  });

  it('formats unknown and failed jobs without unsafe error details', () => {
    expect(formatJobRow(null)).toEqual({
      status: 'not_found',
    });
    expect(formatJobRow({
      job_id: 'job-2',
      job_type: 'ingestion',
      status: 'failed',
    })).toEqual({
      jobId: 'job-2',
      jobType: 'ingestion',
      status: 'failed',
      error: {
        message: 'Document ingestion failed. Please try again.',
      },
    });
    expect(formatJobRow({
      job_id: 'job-3',
      job_type: 'homepage',
      status: 'failed',
      error_message: 'Homepage processing failed. Please try again.',
    })).toEqual({
      jobId: 'job-3',
      jobType: 'homepage',
      status: 'failed',
      error: {
        message: 'Homepage processing failed. Please try again.',
      },
    });
  });
});
