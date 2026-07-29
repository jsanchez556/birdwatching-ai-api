import { jest } from '@jest/globals';
import {
  EmbeddingJobService,
  buildEmbeddingJobId,
  normalizeDocumentId,
} from '../src/ai/services/embeddingJob.service.js';

describe('EmbeddingJobService', () => {
  it('builds stable deterministic job ids from document content hashes', () => {
    expect(buildEmbeddingJobId({
      documentId: 42,
      contentHash: 'abc123!@#',
    })).toBe('embedding-42-abc123');
  });

  it('validates document ids', () => {
    expect(normalizeDocumentId('7')).toBe(7);
    expect(() => normalizeDocumentId('nope')).toThrow('documentId must be a positive integer');
  });

  it('enqueues embedding jobs with only a document id payload', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'embedding-7-hash' });
    const service = new EmbeddingJobService({
      queueFactory: () => ({ add }),
      repository: {},
      embeddingClient: {},
      chunker: {},
      logger: {
        info: jest.fn(),
      },
    });

    await expect(service.enqueueDocumentEmbedding({
      documentId: 7,
      contentHash: 'hash-value',
    })).resolves.toEqual({
      jobId: 'embedding-7-hash-value',
      status: 'queued',
      documentId: 7,
    });

    expect(add).toHaveBeenCalledWith(
      'embedding',
      {
        documentId: 7,
      },
      {
        jobId: 'embedding-7-hash-value',
      }
    );
  });

  it('loads persisted document content, generates embeddings, and replaces chunks idempotently', async () => {
    const repository = {
      findDocumentById: jest.fn().mockResolvedValue({
        id: 7,
        content: 'Name: Resplendent Quetzal',
        metadata: {
          family: 'Trogonidae',
        },
      }),
      replaceDocumentChunks: jest.fn().mockResolvedValue(undefined),
    };
    const chunks = [
      {
        index: 0,
        content: 'Name: Resplendent Quetzal',
        tokenCount: 3,
        metadata: {
          family: 'Trogonidae',
        },
      },
    ];
    const service = new EmbeddingJobService({
      queueFactory: jest.fn(),
      repository,
      embeddingClient: {
        generateEmbedding: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      chunker: {
        chunkText: jest.fn().mockReturnValue(chunks),
      },
      logger: {
        info: jest.fn(),
      },
    });

    await expect(service.processDocumentEmbedding({
      documentId: 7,
    })).resolves.toEqual({
      documentId: 7,
      chunkCount: 1,
    });

    expect(repository.findDocumentById).toHaveBeenCalledWith(7);
    expect(service.chunker.chunkText).toHaveBeenCalledWith('Name: Resplendent Quetzal', {
      chunkSize: undefined,
      chunkOverlap: undefined,
      metadata: {
        family: 'Trogonidae',
      },
    });
    expect(service.embeddingClient.generateEmbedding).toHaveBeenCalledWith([
      'Name: Resplendent Quetzal',
    ]);
    expect(repository.replaceDocumentChunks).toHaveBeenCalledWith(7, [
      {
        ...chunks[0],
        embedding: [0.1, 0.2],
      },
    ]);
  });

  it('fails gracefully when the source document is missing', async () => {
    const service = new EmbeddingJobService({
      queueFactory: jest.fn(),
      repository: {
        findDocumentById: jest.fn().mockResolvedValue(null),
      },
      embeddingClient: {},
      chunker: {},
      logger: {
        info: jest.fn(),
      },
    });

    await expect(service.processDocumentEmbedding({
      documentId: 99,
    })).rejects.toThrow('Embedding source document not found: 99');
  });
});
