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

  it('rejects legacy family-keyed bird knowledge bases', () => {
    expect(() => normalizeKnowledgeBase({
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
    })).toThrow('Knowledge source must contain an array of normalized ingestion documents');
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

  it('formats bird profile text with scientific name, observation, and media availability', () => {
    expect(documentToText({
      family: 'Tinamous',
      name: 'Great Tinamou',
      locations: ['La Cusinga Lodge'],
      description: 'Large ground bird.',
      metadata: {
        scientificName: 'Tinamus major',
        lastObservation: {
          locName: 'La Cusinga Lodge',
          obsDt: '2026-05-21 04:58',
          howMany: 1,
        },
        recentObservations: {
          locations: [
            { locName: 'La Cusinga Lodge' },
            { locName: 'Rainforest Trail' },
          ],
        },
        media: {
          photoUrl: 'https://example.com/photo.jpg',
          songUrl: 'https://example.com/song.mp3',
          sonogramUrl: null,
        },
      },
    })).toBe([
      'Name: Great Tinamou',
      'Scientific name: Tinamus major',
      'Family: Tinamous',
      'Locations: La Cusinga Lodge',
      'Description: Large ground bird.',
      'Recent observation: location La Cusinga Lodge, date 2026-05-21 04:58, count 1',
      'Recent observation locations: La Cusinga Lodge, Rainforest Trail',
      'Media available: photo, song recording',
    ].join('\n'));
  });

  it('omits blank descriptions from bird profile text', () => {
    expect(documentToText({
      family: 'Ducks, Geese, and Waterfowl',
      name: 'Blue-winged x Cinnamon Teal (hybrid)',
      locations: [],
      description: null,
      metadata: {
        scientificName: 'Spatula discors x cyanoptera',
        media: {
          photoUrl: null,
          songUrl: null,
          sonogramUrl: null,
        },
      },
    })).toBe([
      'Name: Blue-winged x Cinnamon Teal (hybrid)',
      'Scientific name: Spatula discors x cyanoptera',
      'Family: Ducks, Geese, and Waterfowl',
    ].join('\n'));
  });

  it('normalizes legacy location arrays', () => {
    expect(normalizeLocations({
      locations: ['Carara', 'Osa Peninsula', 'Tarcoles'],
    })).toBe('Carara, Osa Peninsula, Tarcoles');
  });
});
