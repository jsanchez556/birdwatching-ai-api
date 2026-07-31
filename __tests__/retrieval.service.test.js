import { jest } from '@jest/globals';

const mockGenerateEmbedding = jest.fn();
const mockSearchSimilar = jest.fn();

await jest.unstable_mockModule('../src/ai/clients/openai.client.js', () => ({
  default: {
    generateEmbedding: mockGenerateEmbedding,
  },
}));

await jest.unstable_mockModule('../src/db/repositories/vector/vector.repository.js', () => ({
  default: {
    searchSimilar: mockSearchSimilar,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  calculateCandidateLimit,
  default: retrievalService,
  diversifyByDocument,
  mapRetrievedChunk,
  normalizeFilters,
} = await import('../src/ai/services/retrieval.service.js');

describe('RetrievalService helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps pgvector rows into prompt-compatible knowledge documents', () => {
    expect(mapRetrievedChunk({
      chunk_id: 10,
      chunk_index: 0,
      content: 'Chunk text.',
      chunk_metadata: { description: 'Cloud forest bird.' },
      document_id: 2,
      external_id: 'resplendent-quetzal',
      title: 'Resplendent Quetzal',
      source: 'birds.json',
      document_type: 'bird_profile',
      category: 'Trogonidae',
      locale: 'en-CR',
      tags: ['Monteverde'],
      document_metadata: { locations: 'Monteverde' },
      semantic_score: '0.88',
      keyword_score: '0.12',
      media_priority: '4',
      score: '0.91',
    })).toMatchObject({
      id: 'resplendent-quetzal',
      chunkId: 10,
      name: 'Resplendent Quetzal',
      locations: 'Monteverde',
      description: 'Cloud forest bird.',
      score: 0.91,
      semanticScore: 0.88,
      keywordScore: 0.12,
      mediaPriority: 4,
    });
  });

  it('normalizes top-level category, location, and title into metadata filters', () => {
    expect(normalizeFilters({
      category: 'Trogonidae',
      location: 'Monteverde',
      title: 'Quetzal',
      filters: {
        source: 'birds.json',
      },
    })).toEqual({
      source: 'birds.json',
      category: 'Trogonidae',
      location: 'Monteverde',
      title: 'Quetzal',
    });
  });

  it('limits repeated chunks from the same document by default', () => {
    expect(diversifyByDocument([
      { documentId: 1, chunkId: 10, score: 0.9 },
      { documentId: 1, chunkId: 11, score: 0.85 },
      { documentId: 2, chunkId: 20, score: 0.8 },
    ])).toEqual([
      { documentId: 1, chunkId: 10, score: 0.9 },
      { documentId: 2, chunkId: 20, score: 0.8 },
    ]);
  });

  it('expands the candidate pool before final result trimming', () => {
    expect(calculateCandidateLimit(3)).toBe(12);
    expect(calculateCandidateLimit(10)).toBe(40);
  });

  it('passes category, location, title, and minScore to vector search', async () => {
    mockGenerateEmbedding.mockResolvedValue([[1, 0]]);
    mockSearchSimilar.mockResolvedValue([{
      chunk_id: 10,
      chunk_index: 0,
      content: 'Chunk text.',
      chunk_metadata: { description: 'Cloud forest bird.' },
      document_id: 2,
      external_id: 'resplendent-quetzal',
      title: 'Resplendent Quetzal',
      source: 'birds.json',
      document_type: 'bird_profile',
      category: 'Trogonidae',
      locale: 'en-CR',
      tags: ['Monteverde'],
      document_metadata: { locations: 'Monteverde' },
      semantic_score: '0.88',
      keyword_score: '0.12',
      score: '0.91',
    }]);

    const documents = await retrievalService.retrieve('quetzal in monteverde', {
      topK: 4,
      category: 'Trogonidae',
      location: 'Monteverde',
      title: 'Quetzal',
      minScore: 0.7,
      semanticWeight: 0.8,
      keywordWeight: 0.2,
    });

    expect(mockSearchSimilar).toHaveBeenCalledWith([1, 0], {
      limit: 16,
      filters: {
        category: 'Trogonidae',
        location: 'Monteverde',
        title: 'Quetzal',
      },
      minScore: 0.7,
      minSemanticScore: undefined,
      queryText: 'quetzal in monteverde',
      semanticWeight: 0.8,
      keywordWeight: 0.2,
    });
    expect(documents[0]).toMatchObject({
      name: 'Resplendent Quetzal',
      score: 0.91,
    });
  });
});
