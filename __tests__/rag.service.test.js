import { jest } from '@jest/globals';

const mockRetrieve = jest.fn();
const mockFindBirdProfile = jest.fn();

await jest.unstable_mockModule('../src/db/retrieval/retrieval.service.js', () => ({
  default: {
    retrieve: mockRetrieve,
  },
}));

await jest.unstable_mockModule('../src/db/vector/vector.repository.js', () => ({
  default: {
    findBirdProfile: mockFindBirdProfile,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: ragService } = await import('../src/services/rag.service.js');
const { formatRetrievedContext } = await import('../src/ai/prompts/rag.context.js');
const { default: logger } = await import('../src/utils/logger.js');

describe('RagService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a frontend-safe bird profile for exact key bird lookups', async () => {
    mockFindBirdProfile.mockResolvedValue({
      id: 'bird-quetz1',
      documentType: 'bird_profile',
      name: 'Resplendent Quetzal',
      category: 'Trogons',
      locations: 'Monteverde',
      description: 'Cloud forest icon.',
      metadata: {
        speciesCode: 'quetz1',
        commonName: 'Resplendent Quetzal',
        scientificName: 'Pharomachrus mocinno',
        familyCommonName: 'Trogons',
        lastObservation: {
          locations: ['Monteverde'],
          obsDt: '2026-05-21 05:30',
          howMany: 1,
        },
        media: {
          photoUrl: '/photos/quetzal.jpg',
          squarePhotoUrl: '/photos/quetzal-square.jpg',
          songUrl: '/songs/quetzal.mp3',
          sonogramUrl: '/sonograms/quetzal.png',
          songLength: '0:38',
          songAttributionHtml: '<p>Recorded by Example.</p>',
        },
      },
    });

    await expect(ragService.getBirdProfile({
      speciesCode: 'quetz1',
      name: 'Resplendent Quetzal',
    })).resolves.toEqual({
      speciesCode: 'quetz1',
      commonName: 'Resplendent Quetzal',
      scientificName: 'Pharomachrus mocinno',
      family: 'Trogons',
      description: 'Cloud forest icon.',
      locations: 'Monteverde',
      lastObservation: {
        locations: ['Monteverde'],
        obsDt: '2026-05-21 05:30',
        howMany: 1,
      },
      media: {
        photoUrl: '/photos/quetzal.jpg',
        squarePhotoUrl: '/photos/quetzal-square.jpg',
        songUrl: '/songs/quetzal.mp3',
        sonogramUrl: '/sonograms/quetzal.png',
        songLength: '0:38',
        songAttributionHtml: '<p>Recorded by Example.</p>',
      },
    });
    expect(mockFindBirdProfile).toHaveBeenCalledWith({
      speciesCode: 'quetz1',
      name: 'Resplendent Quetzal',
    });
  });

  it('formats retrieved bird context for prompt injection', () => {
    expect(formatRetrievedContext([
      {
        name: 'Resplendent Quetzal',
        category: 'Trogons',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
        score: 0.98765,
        metadata: {
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          familyCommonName: 'Trogons',
        },
      },
    ])).toContain(
      '1. Resplendent Quetzal\nSimilarity score: 0.9877\nCommon name: Resplendent Quetzal\nScientific name: Pharomachrus mocinno\nFamily: Trogons\nLocations: Monteverde\nDescription: Cloud forest bird.'
    );
  });

  it('injects relevant retrieved context after the base system message', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];
    const documents = [
      {
        id: 'Resplendent Quetzal',
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
        score: 0.98,
      },
    ];

    mockRetrieve.mockResolvedValue(documents);

    const context = await ragService.buildContext(
      messages,
      'Where can I see quetzals?',
      { conversationId: 'conversation-123' }
    );

    expect(mockRetrieve).toHaveBeenCalledWith('Where can I see quetzals?', {
      topK: 3,
      filters: {},
      minScore: undefined,
      minSemanticScore: undefined,
      maxChunksPerDocument: undefined,
    });
    expect(context.messages).toEqual([
      { role: 'system', content: 'Base prompt' },
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Resplendent Quetzal'),
      }),
      { role: 'user', content: 'Where can I see quetzals?' },
    ]);
    expect(context.sources).toEqual([
      {
        name: 'Resplendent Quetzal',
        location: 'Monteverde',
        similarityScore: 0.98,
      },
    ]);
    expect(context.birdMatches).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith('RAG context retrieved for chat', {
      conversationId: 'conversation-123',
      documentCount: 1,
      topK: 3,
      results: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde',
          similarityScore: 0.98,
        },
      ],
    });
  });

  it('returns original messages when retrieval fails', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    mockRetrieve.mockRejectedValue(new Error('PostgreSQL unavailable'));

    await expect(ragService.buildContext(messages, 'Where can I see quetzals?'))
      .resolves.toEqual({
        messages,
        sources: [],
        birdMatches: [],
      });
  });

  it('returns original messages when pgvector has no matching documents', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    mockRetrieve.mockResolvedValue([]);

    await expect(ragService.buildContext(messages, 'Where can I see quetzals?'))
      .resolves.toEqual({
        messages,
        sources: [],
        birdMatches: [],
      });
  });

  it('builds compact bird match metadata from retrieved bird profiles', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Tell me about tinamous.' },
    ];

    mockRetrieve.mockResolvedValue([
      {
        id: 'bird-gretin1',
        documentType: 'bird_profile',
        name: 'Great Tinamou',
        category: 'Tinamous',
        locations: 'La Cusinga Lodge',
        description: 'Large ground bird.',
        metadata: {
          speciesCode: 'gretin1',
          commonName: 'Great Tinamou',
          scientificName: 'Tinamus major',
          familyCommonName: 'Tinamous',
          lastObservation: {
            locations: ['La Cusinga Lodge'],
            obsDt: '2026-05-21 04:58',
            howMany: 1,
          },
          media: {
            photoUrl: 'https://example.com/photo.jpg',
            squarePhotoUrl: 'https://example.com/square.jpg',
            photoAttribution: 'Photo by Example Birder',
            wikiTitle: 'Great_tinamou',
            songUrl: 'https://example.com/song.mp3',
            sonogramUrl: null,
            songLength: '0:42',
            songAttributionHtml: '<p>Sound recording by Example Recordist. Licensed under CC BY-NC-SA 3.0.</p>',
          },
        },
      },
      {
        id: 'bird-gretin1-duplicate',
        documentType: 'bird_profile',
        name: 'Great Tinamou',
        metadata: {
          speciesCode: 'gretin1',
        },
      },
      {
        id: 'knowledge-1',
        documentType: 'knowledge_document',
        name: 'General birding',
      },
    ]);

    await expect(ragService.buildContext(messages, 'Tell me about tinamous.'))
      .resolves.toMatchObject({
        birdMatches: [
          {
            speciesCode: 'gretin1',
            commonName: 'Great Tinamou',
            scientificName: 'Tinamus major',
            family: 'Tinamous',
            description: 'Large ground bird.',
            locations: 'La Cusinga Lodge',
            lastObservation: {
              locations: ['La Cusinga Lodge'],
              obsDt: '2026-05-21 04:58',
              howMany: 1,
            },
            media: {
              photoUrl: 'https://example.com/photo.jpg',
              squarePhotoUrl: 'https://example.com/square.jpg',
              photoAttribution: 'Photo by Example Birder',
              wikiTitle: 'Great_tinamou',
              songUrl: 'https://example.com/song.mp3',
              songLength: '0:42',
              songAttributionHtml: '<p>Sound recording by Example Recordist. Licensed under CC BY-NC-SA 3.0.</p>',
            },
          },
        ],
      });
  });

  it('prefers bird identity matches over location-only matches for bird match metadata', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Tell me about quetzals.' },
    ];

    mockRetrieve.mockResolvedValue([
      {
        id: 'bird-spwqua1',
        documentType: 'bird_profile',
        name: 'Spotted Wood-Quail',
        category: 'New World Quail',
        locations: 'San Gerardo de Dota--Quetzal Valley',
        description: 'Small ground-dwelling bird.',
        score: 0.95,
        metadata: {
          speciesCode: 'spwqua1',
          commonName: 'Spotted Wood-Quail',
          scientificName: 'Odontophorus guttatus',
          familyCommonName: 'New World Quail',
        },
      },
      {
        id: 'bird-resque1',
        documentType: 'bird_profile',
        name: 'Resplendent Quetzal',
        category: 'Trogons',
        locations: 'Curi-Cancha Refugio de Vida Silvestre, Monte Verde Cloud Forest Reserve',
        description: 'Cloud forest bird in the trogon family.',
        score: 0.9,
        metadata: {
          speciesCode: 'resque1',
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          familyCommonName: 'Trogons',
        },
      },
      {
        id: 'bird-bfqdov1',
        documentType: 'bird_profile',
        name: 'Buff-fronted Quail-Dove',
        category: 'Pigeons and Doves',
        locations: 'Providencia Rd, Los Quetzales NP, San José',
        description: 'Talamancan montane forest bird.',
        score: 0.88,
        metadata: {
          speciesCode: 'bfqdov1',
          commonName: 'Buff-fronted Quail-Dove',
          scientificName: 'Zentrygon costaricensis',
          familyCommonName: 'Pigeons and Doves',
        },
      },
    ]);

    await expect(ragService.buildContext(messages, 'Tell me about quetzals.'))
      .resolves.toMatchObject({
        birdMatches: [
          {
            speciesCode: 'resque1',
            commonName: 'Resplendent Quetzal',
          },
        ],
      });
  });

  it('supplements broad bird group matches with more species from the matched family', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Tell me about ducks in Costa Rica.' },
    ];
    const muscovyDuck = {
      id: 'bird-musduc',
      documentType: 'bird_profile',
      name: 'Muscovy Duck',
      category: 'Ducks, Geese, and Waterfowl',
      locations: 'Natural Lodge Caño Negro',
      description: 'Large native duck.',
      score: 0.95,
      metadata: {
        speciesCode: 'musduc',
        commonName: 'Muscovy Duck',
        scientificName: 'Cairina moschata',
        familyCommonName: 'Ducks, Geese, and Waterfowl',
      },
    };

    mockRetrieve
      .mockResolvedValueOnce([muscovyDuck])
      .mockResolvedValueOnce([
        muscovyDuck,
        {
          id: 'bird-bbwduc',
          documentType: 'bird_profile',
          name: 'Black-bellied Whistling-Duck',
          category: 'Ducks, Geese, and Waterfowl',
          locations: 'Niskaa Laká',
          description: 'Whistling duck seen in wetlands.',
          score: 0.9,
          metadata: {
            speciesCode: 'bbwduc',
            commonName: 'Black-bellied Whistling-Duck',
            scientificName: 'Dendrocygna autumnalis',
            familyCommonName: 'Ducks, Geese, and Waterfowl',
          },
        },
        {
          id: 'bird-comduc3',
          documentType: 'bird_profile',
          name: 'Comb Duck',
          category: 'Ducks, Geese, and Waterfowl',
          locations: 'Unknown',
          description: 'Tropical duck.',
          score: 0.88,
          metadata: {
            speciesCode: 'comduc3',
            commonName: 'Comb Duck',
            scientificName: 'Sarkidiornis sylvicola',
            familyCommonName: 'Ducks, Geese, and Waterfowl',
          },
        },
      ]);

    const context = await ragService.buildContext(messages, 'Tell me about ducks in Costa Rica.');

    expect(mockRetrieve).toHaveBeenNthCalledWith(2, 'Tell me about ducks in Costa Rica.', {
      topK: 8,
      filters: {
        category: 'Ducks, Geese, and Waterfowl',
      },
      minScore: undefined,
      minSemanticScore: undefined,
      maxChunksPerDocument: undefined,
    });
    expect(context.birdMatches).toEqual([
      expect.objectContaining({
        speciesCode: 'musduc',
        commonName: 'Muscovy Duck',
      }),
      expect.objectContaining({
        speciesCode: 'bbwduc',
        commonName: 'Black-bellied Whistling-Duck',
      }),
      expect.objectContaining({
        speciesCode: 'comduc3',
        commonName: 'Comb Duck',
      }),
    ]);
    expect(context.messages[1].content).toContain('Black-bellied Whistling-Duck');
  });

  it('orders equally relevant bird matches by media completeness', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Tell me about ducks.' },
    ];
    const documents = [
      {
        id: 'bird-no-media',
        documentType: 'bird_profile',
        name: 'Plain Duck',
        category: 'Ducks, Geese, and Waterfowl',
        description: 'Duck without media.',
        score: 0.99,
        metadata: {
          speciesCode: 'noduck',
          commonName: 'Plain Duck',
          scientificName: 'Anas mediazero',
          familyCommonName: 'Ducks, Geese, and Waterfowl',
        },
      },
      {
        id: 'bird-sound-media',
        documentType: 'bird_profile',
        name: 'Calling Duck',
        category: 'Ducks, Geese, and Waterfowl',
        description: 'Duck with sound.',
        score: 0.3,
        metadata: {
          speciesCode: 'soundduck',
          commonName: 'Calling Duck',
          scientificName: 'Anas soundonly',
          familyCommonName: 'Ducks, Geese, and Waterfowl',
          media: {
            songUrl: 'https://example.com/calling-duck.mp3',
          },
        },
      },
      {
        id: 'bird-image-media',
        documentType: 'bird_profile',
        name: 'Portrait Duck',
        category: 'Ducks, Geese, and Waterfowl',
        description: 'Duck with image.',
        score: 0.2,
        metadata: {
          speciesCode: 'imageduck',
          commonName: 'Portrait Duck',
          scientificName: 'Anas imageonly',
          familyCommonName: 'Ducks, Geese, and Waterfowl',
          media: {
            photoUrl: 'https://example.com/portrait-duck.jpg',
          },
        },
      },
      {
        id: 'bird-full-media',
        documentType: 'bird_profile',
        name: 'Rich Media Duck',
        category: 'Ducks, Geese, and Waterfowl',
        description: 'Duck with image and sound.',
        score: 0.1,
        metadata: {
          speciesCode: 'fullduck',
          commonName: 'Rich Media Duck',
          scientificName: 'Anas fullmedia',
          familyCommonName: 'Ducks, Geese, and Waterfowl',
          media: {
            photoUrl: 'https://example.com/rich-media-duck.jpg',
            songUrl: 'https://example.com/rich-media-duck.mp3',
          },
        },
      },
    ];

    mockRetrieve
      .mockResolvedValueOnce(documents)
      .mockResolvedValueOnce(documents);

    const context = await ragService.buildContext(messages, 'Tell me about ducks.');

    expect(context.birdMatches.map((match) => match.speciesCode)).toEqual([
      'fullduck',
      'imageduck',
      'soundduck',
      'noduck',
    ]);
  });
});
