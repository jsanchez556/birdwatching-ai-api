import { jest } from '@jest/globals';
import {
  DocumentIngestionService,
  SAFE_DOCUMENT_INGESTION_ERROR,
  formatIngestionRow,
  normalizeJsonDocuments,
  normalizeUploadedDocument,
} from '../src/services/documentIngestion.service.js';

describe('DocumentIngestionService', () => {
  it('normalizes JSON text uploads into ingestion documents', () => {
    expect(normalizeJsonDocuments({
      text: 'Cloud forest bird.',
      title: 'Quetzal notes',
      source: 'field-notes',
      tags: ['quetzal'],
    }, 'job-1')).toEqual([{
      externalId: 'upload-job-1',
      name: 'Quetzal notes',
      description: 'Cloud forest bird.',
      documentType: 'uploaded_document',
      category: null,
      tags: ['quetzal'],
      metadata: {},
    }]);
  });

  it('normalizes raw text uploads into ingestion documents', () => {
    expect(normalizeUploadedDocument({
      buffer: Buffer.from('Cloud forest bird.'),
      mimeType: 'text/plain',
      filename: 'quetzal.txt',
    }, 'job-1')).toEqual([{
      externalId: 'upload-job-1',
      name: 'quetzal.txt',
      description: 'Cloud forest bird.',
      documentType: 'uploaded_document',
      metadata: {
        filename: 'quetzal.txt',
        mimeType: 'text/plain',
      },
    }]);
  });

  it('creates a durable ingestion row and enqueues only the job id', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn(),
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: () => ({ add }),
      ingestionService: {},
    });

    const result = await service.enqueueIngestion({
      body: {
        documents: [{
          externalId: 'doc-1',
          name: 'Document One',
          description: 'Bird habitat notes.',
        }],
        source: 'upload.json',
        force: true,
      },
      userId: '7',
    });

    expect(result).toEqual({
      jobId: expect.any(String),
      status: 'queued',
    });
    expect(queries.createJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: result.jobId,
      jobType: 'ingestion',
      userId: 7,
      requestParams: {
        sourceType: 'json',
        sourceMetadata: expect.objectContaining({
          source: 'upload.json',
          documentCount: 1,
        }),
        sourcePayload: {
          documents: [{
            externalId: 'doc-1',
            name: 'Document One',
            description: 'Bird habitat notes.',
          }],
          options: {
            force: true,
            source: 'upload.json',
            documentType: undefined,
          },
        },
      },
    }));
    expect(add).toHaveBeenCalledWith(
      'ingestion',
      {
        jobId: result.jobId,
      },
      {
        jobId: result.jobId,
      }
    );
  });

  it('marks ingestion failed if queue enqueue fails', async () => {
    const error = new Error('redis unavailable');
    const queries = {
      createJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: () => ({
        add: jest.fn().mockRejectedValue(error),
      }),
      ingestionService: {},
    });

    await expect(service.enqueueIngestion({
      body: {
        text: 'Cloud forest bird.',
      },
      userId: 7,
    })).rejects.toThrow('redis unavailable');

    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: expect.any(String),
      errorMessage: SAFE_DOCUMENT_INGESTION_ERROR,
    });
  });

  it('processes queued ingestion jobs through the existing ingestion service', async () => {
    const queries = {
      getJobForProcessing: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        source_payload: {
          documents: [{
            externalId: 'doc-1',
            name: 'Document One',
          }],
          options: {
            source: 'upload.json',
          },
        },
      }),
      markActive: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      completeJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      failJob: jest.fn(),
    };
    const ingestionResult = {
      documentCount: 1,
      chunkCount: 2,
      queuedCount: 1,
      skippedCount: 0,
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: jest.fn(),
      ingestionService: {
        ingestDocuments: jest.fn().mockResolvedValue(ingestionResult),
      },
    });

    await expect(service.processIngestion({
      jobId: 'job-1',
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: ingestionResult,
    });

    expect(queries.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(service.ingestionService.ingestDocuments).toHaveBeenCalledWith(
      [{
        externalId: 'doc-1',
        name: 'Document One',
      }],
      {
        source: 'upload.json',
      }
    );
    expect(queries.completeJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      result: ingestionResult,
    });
    expect(queries.failJob).not.toHaveBeenCalled();
  });

  it('does not mark ingestion failed before the final retry attempt', async () => {
    const queries = {
      getJobForProcessing: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        source_payload: {
          documents: [{
            externalId: 'doc-1',
            name: 'Document One',
          }],
          options: {},
        },
      }),
      markActive: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      completeJob: jest.fn(),
      failJob: jest.fn(),
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: jest.fn(),
      ingestionService: {
        ingestDocuments: jest.fn().mockRejectedValue(new Error('temporary provider failure')),
      },
    });

    await expect(service.processIngestion({
      jobId: 'job-1',
      finalAttempt: false,
    })).rejects.toThrow('temporary provider failure');

    expect(queries.markActive).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(queries.failJob).not.toHaveBeenCalled();
  });

  it('marks ingestion failed on the final retry attempt', async () => {
    const queries = {
      getJobForProcessing: jest.fn().mockResolvedValue({
        job_id: 'job-1',
        source_payload: {
          documents: [{
            externalId: 'doc-1',
            name: 'Document One',
          }],
          options: {},
        },
      }),
      markActive: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      completeJob: jest.fn(),
      failJob: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: jest.fn(),
      ingestionService: {
        ingestDocuments: jest.fn().mockRejectedValue(new Error('exhausted provider failure')),
      },
    });

    await expect(service.processIngestion({
      jobId: 'job-1',
      finalAttempt: true,
    })).rejects.toThrow('exhausted provider failure');

    expect(queries.failJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorMessage: SAFE_DOCUMENT_INGESTION_ERROR,
    });
  });

  it('returns ingestion status lifecycle responses for polling', async () => {
    const queries = {
      getJob: jest.fn()
        .mockResolvedValueOnce({
          job_id: 'job-1',
          status: 'queued',
        })
        .mockResolvedValueOnce({
          job_id: 'job-1',
          status: 'active',
        })
        .mockResolvedValueOnce({
          job_id: 'job-1',
          status: 'failed',
          error_message: 'Safe failure',
        }),
    };
    const service = new DocumentIngestionService({
      queries,
      queueFactory: jest.fn(),
      ingestionService: {},
    });

    await expect(service.getIngestionStatus({
      jobId: 'job-1',
      userId: '7',
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'queued',
    });
    await expect(service.getIngestionStatus({
      jobId: 'job-1',
      userId: 7,
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'active',
    });
    await expect(service.getIngestionStatus({
      jobId: 'job-1',
      userId: 7,
    })).resolves.toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: {
        message: 'Safe failure',
      },
    });
  });

  it('formats polling responses without exposing source payloads', () => {
    expect(formatIngestionRow({
      job_id: 'job-1',
      status: 'completed',
      source_payload: {
        documents: [{ description: 'hidden' }],
      },
      result: {
        documentCount: 1,
      },
    })).toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: {
        documentCount: 1,
      },
    });
    expect(formatIngestionRow(null)).toEqual({
      status: 'not_found',
    });
  });
});
