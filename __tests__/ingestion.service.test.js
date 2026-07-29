import { jest } from '@jest/globals';

const mockGenerateEmbedding = jest.fn();
const mockInitializeSchema = jest.fn();
const mockFindDocumentByExternalId = jest.fn();
const mockUpsertDocument = jest.fn();
const mockReplaceDocumentChunks = jest.fn();
const mockEnqueueDocumentEmbedding = jest.fn();

await jest.unstable_mockModule('../src/ai/clients/openai.client.js', () => ({
  default: {
    generateEmbedding: mockGenerateEmbedding,
  },
}));

await jest.unstable_mockModule('../src/ai/services/embeddings.service.js', () => ({
  default: {
  },
  documentToText: (document) => [
    `Name: ${document.name}`,
    `Family: ${document.family}`,
    `Locations: ${document.location}`,
    `Description: ${document.description}`,
  ].filter((line) => !line.endsWith(': undefined')).join('\n'),
  normalizeKnowledgeBase: (documents) => documents,
  normalizeLocations: (document) => document.location || '',
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/db/vector/vector.repository.js', () => ({
  default: {
    initializeSchema: mockInitializeSchema,
    findDocumentByExternalId: mockFindDocumentByExternalId,
    upsertDocument: mockUpsertDocument,
    replaceDocumentChunks: mockReplaceDocumentChunks,
  },
}));

await jest.unstable_mockModule('../src/ai/services/embeddingJob.service.js', () => ({
  default: {
    enqueueDocumentEmbedding: mockEnqueueDocumentEmbedding,
  },
}));

const {
  default: ingestService,
  hashContent,
  normalizeDocument,
  validateNormalizedDocument,
} = await import('../src/ingestion/services/ingest.service.js');

describe('IngestService helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeSchema.mockResolvedValue(undefined);
    mockFindDocumentByExternalId.mockResolvedValue(null);
    mockUpsertDocument.mockResolvedValue({
      id: 7,
      content_hash: 'hash-1',
    });
    mockEnqueueDocumentEmbedding.mockResolvedValue({
      jobId: 'embedding-7-hash',
      status: 'queued',
    });
  });

  it('creates stable hashes for idempotent document ingestion', () => {
    expect(hashContent('quetzal')).toBe(hashContent('quetzal'));
    expect(hashContent('quetzal')).not.toBe(hashContent('toucan'));
  });

  it('normalizes bird documents for durable vector storage', () => {
    expect(normalizeDocument({
      externalId: 'bird-quetza1',
      family: 'Trogonidae',
      name: 'Resplendent Quetzal',
      location: 'Monteverde',
      description: 'Cloud forest bird.',
      documentType: 'bird_profile',
    })).toMatchObject({
      externalId: 'bird-quetza1',
      title: 'Resplendent Quetzal',
      source: 'knowledge',
      documentType: 'bird_profile',
      category: 'Trogonidae',
      locale: 'en-CR',
      metadata: {
        family: 'Trogonidae',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
      },
      active: true,
    });
  });

  it('rejects documents outside the normalized ingestion contract', () => {
    expect(() => validateNormalizedDocument({
      title: 'Legacy title',
      content: 'Legacy content.',
    }, 0)).toThrow('Invalid normalized document at index 0: missing externalId, name');
  });

  it('allows normalized bird documents without descriptions', () => {
    expect(() => validateNormalizedDocument({
      externalId: 'bird-bwxtea1',
      name: 'Blue-winged x Cinnamon Teal (hybrid)',
      description: null,
    }, 17)).not.toThrow();
  });

  it('queues embedding jobs instead of generating embeddings inline', async () => {
    await expect(ingestService.ingestDocuments([
      {
        externalId: 'bird-quetza1',
        name: 'Resplendent Quetzal',
        family: 'Trogonidae',
        description: 'Cloud forest bird.',
      },
    ], {
      source: 'birds.json',
    })).resolves.toMatchObject({
      documentCount: 1,
      queuedCount: 1,
      skippedCount: 0,
    });

    expect(mockUpsertDocument).toHaveBeenCalledWith(expect.objectContaining({
      externalId: 'bird-quetza1',
      content: expect.stringContaining('Name: Resplendent Quetzal'),
      contentHash: expect.any(String),
    }));
    expect(mockEnqueueDocumentEmbedding).toHaveBeenCalledWith({
      documentId: 7,
      contentHash: expect.any(String),
    });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockReplaceDocumentChunks).not.toHaveBeenCalled();
  });
});
