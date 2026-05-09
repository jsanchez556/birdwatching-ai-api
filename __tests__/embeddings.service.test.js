import { jest } from '@jest/globals';

const mockWarn = jest.fn();

await jest.unstable_mockModule('../src/ai/openai.client.js', () => ({
  default: {
    generateEmbedding: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: mockWarn,
    error: jest.fn(),
  },
}));

const {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
} = await import('../src/services/embeddings.service.js');

describe('EmbeddingsService helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flattens the family-keyed birds knowledge base into bird documents', () => {
    const documents = normalizeKnowledgeBase({
      Trogonidae: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde, San Gerardo de Dota',
          description: 'Cloud forest bird.',
        },
      ],
      Ramphastidae: [
        {
          name: 'Keel-billed Toucan',
          location: 'Sarapiqui, Tortuguero',
          description: 'Bright-billed toucan.',
        },
      ],
    });

    expect(documents).toEqual([
      {
        family: 'Trogonidae',
        name: 'Resplendent Quetzal',
        location: 'Monteverde, San Gerardo de Dota',
        description: 'Cloud forest bird.',
      },
      {
        family: 'Ramphastidae',
        name: 'Keel-billed Toucan',
        location: 'Sarapiqui, Tortuguero',
        description: 'Bright-billed toucan.',
      },
    ]);
  });

  it('keeps array knowledge bases compatible', () => {
    const documents = [{ name: 'Scarlet Macaw', description: 'Large macaw.' }];

    expect(normalizeKnowledgeBase(documents)).toBe(documents);
  });

  it('formats bird text with family and normalized locations', () => {
    expect(documentToText({
      family: 'Trogonidae',
      name: 'Resplendent Quetzal',
      location: 'Monteverde, San Gerardo de Dota',
      description: 'Cloud forest bird.',
    })).toBe([
      'Name: Resplendent Quetzal',
      'Family: Trogonidae',
      'Locations: Monteverde, San Gerardo de Dota',
      'Description: Cloud forest bird.',
    ].join('\n'));
  });

  it('normalizes legacy location arrays', () => {
    expect(normalizeLocations({
      locations: ['Carara', 'Osa Peninsula', 'Tarcoles'],
    })).toBe('Carara, Osa Peninsula, Tarcoles');
  });
});
