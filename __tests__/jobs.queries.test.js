import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: jobsQueries } = await import('../src/db/queries/jobs.queries.js');

describe('JobsQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a generic job row with request params', async () => {
    const jobRow = {
      job_id: 'job-1',
      job_type: 'bird-identification',
      status: 'queued',
    };
    mockQuery.mockResolvedValue({ rows: [jobRow] });

    await expect(jobsQueries.createJob({
      jobId: 'job-1',
      jobType: 'bird-identification',
      userId: 7,
      requestParams: {
        imageUrl: 'https://example.test/bird.jpg',
      },
    })).resolves.toBe(jobRow);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM create_job($1, $2, $3, $4::jsonb)',
      [
        'job-1',
        'bird-identification',
        7,
        JSON.stringify({ imageUrl: 'https://example.test/bird.jpg' }),
      ]
    );
  });

  it('loads owner-scoped and public jobs through the shared function', async () => {
    const jobRow = {
      job_id: 'job-1',
      job_type: 'homepage',
      status: 'completed',
    };
    mockQuery.mockResolvedValue({ rows: [jobRow] });

    await expect(jobsQueries.getJob({
      jobId: 'job-1',
      userId: 7,
      jobType: 'homepage',
      allowPublic: true,
    })).resolves.toBe(jobRow);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_job($1, $2, $3, $4)',
      ['job-1', 7, 'homepage', true]
    );
  });

  it('loads jobs for worker processing without owner scope', async () => {
    mockQuery.mockResolvedValue({ rows: [{ job_id: 'job-1' }] });

    await jobsQueries.getJobForProcessing({
      jobId: 'job-1',
      jobType: 'ingestion',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_job_for_processing($1, $2)',
      ['job-1', 'ingestion']
    );
  });

  it('updates generic lifecycle states', async () => {
    mockQuery.mockResolvedValue({ rows: [{ job_id: 'job-1' }] });

    await jobsQueries.markActive({ jobId: 'job-1' });
    await jobsQueries.completeJob({
      jobId: 'job-1',
      result: { ok: true },
      meta: { model: 'gpt-4o' },
    });
    await jobsQueries.failJob({
      jobId: 'job-1',
      errorMessage: 'Safe failure',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM mark_job_active($1)',
      ['job-1']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM complete_job($1, $2::jsonb, $3::jsonb)',
      ['job-1', JSON.stringify({ ok: true }), JSON.stringify({ model: 'gpt-4o' })]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      'SELECT * FROM fail_job($1, $2)',
      ['job-1', 'Safe failure']
    );
  });
});
