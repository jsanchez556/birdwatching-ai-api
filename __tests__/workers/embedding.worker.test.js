import { jest } from '@jest/globals';
import { createEmbeddingProcessor } from '../../src/workers/embedding.worker.js';

describe('embedding worker', () => {
  it('processes embedding jobs through the embedding job service', async () => {
    const jobService = {
      processDocumentEmbedding: jest.fn().mockResolvedValue({
        documentId: 7,
        chunkCount: 2,
      }),
    };
    const processor = createEmbeddingProcessor({ jobService });

    await expect(processor({
      name: 'embedding',
      data: {
        documentId: 7,
      },
    })).resolves.toEqual({
      documentId: 7,
      chunkCount: 2,
    });

    expect(jobService.processDocumentEmbedding).toHaveBeenCalledWith({
      documentId: 7,
    });
  });

  it('rejects unsupported job names and invalid payloads', async () => {
    const processor = createEmbeddingProcessor({
      jobService: {
        processDocumentEmbedding: jest.fn(),
      },
    });

    await expect(processor({
      name: 'other',
      data: {
        documentId: 7,
      },
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Unsupported embedding job: other',
    });
    await expect(processor({
      name: 'embedding',
      data: {},
    })).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Embedding job payload is invalid',
    });
  });
});
