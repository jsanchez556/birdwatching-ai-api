import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/ai/openai.client.js', () => ({
  default: {
    generateEmbedding: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/embeddings.service.js', () => ({
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
    initializeSchema: jest.fn(),
    findDocumentByExternalId: jest.fn(),
    upsertDocument: jest.fn(),
    replaceDocumentChunks: jest.fn(),
  },
}));

const {
  hashContent,
  normalizeDocument,
} = await import('../src/db/ingestion/ingestion.service.js');

describe('IngestionService helpers', () => {
  it('creates stable hashes for idempotent document ingestion', () => {
    expect(hashContent('quetzal')).toBe(hashContent('quetzal'));
    expect(hashContent('quetzal')).not.toBe(hashContent('toucan'));
  });

  it('normalizes bird documents for durable vector storage', () => {
    expect(normalizeDocument({
      family: 'Trogonidae',
      name: 'Resplendent Quetzal',
      location: 'Monteverde',
      description: 'Cloud forest bird.',
    })).toMatchObject({
      externalId: 'resplendent-quetzal',
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
});
