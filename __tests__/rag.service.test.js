import { jest } from '@jest/globals';

const mockRetrieve = jest.fn();
const mockFindBirdProfile = jest.fn();
const mockAnalyticsTrack = jest.fn();

await jest.unstable_mockModule('../src/analytics/analytics.service.js', () => ({
  default: {
    track: mockAnalyticsTrack,
  },
}));

await jest.unstable_mockModule('../src/ai/services/retrieval.service.js', () => ({
  default: {
    retrieve: mockRetrieve,
  },
}));

await jest.unstable_mockModule('../src/db/vector/vector.repository.js', () => ({
  default: {
    findBirdProfile: mockFindBirdProfile,
  },
}));

await jest.unstable_mockModule('../src/cache/retrievalCache.js', () => ({
  default: () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
}));

const mockTraceCacheOperation = jest.fn(async (name, metadata, operation) => operation());

await jest.unstable_mockModule('../src/tracing/aiTracing.middleware.js', () => ({
  traceCacheOperation: mockTraceCacheOperation,
  traceRagPipeline: async (name, metadata, operation) => operation(),
  traceRagRetrieval: async (name, metadata, operation) => operation(),
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  default: ragService,
  buildRetrievalCacheKey,
  RagService,
  summarizeRetrievedChunks,
} = await import('../src/services/rag.service.js');
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

  it('builds stable retrieval cache keys for equivalent questions and matching parameters', () => {
    const options = {
      topK: 5,
      filters: {
        location: 'Monteverde',
        category: 'Trogons',
      },
      minScore: 0.2,
      minSemanticScore: 0.15,
      maxChunksPerDocument: 1,
    };

    expect(buildRetrievalCacheKey(' Where can I see QUÉTZALS??? ', options))
      .toBe(buildRetrievalCacheKey('where can i see quetzals', {
        ...options,
        filters: {
          category: 'Trogons',
          location: 'Monteverde',
        },
      }));
  });

  it('returns cached retrieval chunks without calling pgvector-backed retrieval', async () => {
    const documents = [
      {
        id: 'bird-resque1',
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
      },
    ];
    const retriever = {
      retrieve: jest.fn(),
    };
    const retrievalCache = {
      get: jest.fn().mockResolvedValue(documents),
      set: jest.fn(),
    };
    const service = new RagService({
      retriever,
      retrievalCache,
      redisConfig: { retrievalCacheTtlSeconds: 45 },
      log: logger,
    });

    await expect(service.retrieveContext('Where can I see quetzals?', {
      conversationId: 'conversation-123',
      topK: 5,
    })).resolves.toEqual(documents);

    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(retrievalCache.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('CACHE HIT', {
      cache: 'rag_retrieval',
      conversationId: 'conversation-123',
    });
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'rag_retrieval_cache_lookup',
      expect.objectContaining({
        conversationId: 'conversation-123',
        cacheName: 'rag_retrieval',
      }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).not.toHaveBeenCalledWith(
      'rag_retrieval_cache_write',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('caches retrieval chunks after a cache miss using the configured TTL', async () => {
    const documents = [
      {
        id: 'bird-resque1',
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
      },
    ];
    const retriever = {
      retrieve: jest.fn().mockResolvedValue(documents),
    };
    const retrievalCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RagService({
      retriever,
      retrievalCache,
      redisConfig: { retrievalCacheTtlSeconds: 90 },
      log: logger,
    });

    await expect(service.retrieveContext('Where can I see quetzals?', {
      conversationId: 'conversation-123',
      topK: 5,
      location: 'Monteverde',
    })).resolves.toEqual(documents);

    expect(retriever.retrieve).toHaveBeenCalledWith('Where can I see quetzals?', {
      topK: 5,
      filters: {
        location: 'Monteverde',
      },
      minScore: undefined,
      minSemanticScore: undefined,
      maxChunksPerDocument: undefined,
    });
    expect(retrievalCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^rag-retrieval:[a-f0-9]{64}$/),
      documents,
      { ttlSeconds: 90 }
    );
    expect(logger.info).toHaveBeenCalledWith('CACHE MISS', {
      cache: 'rag_retrieval',
      conversationId: 'conversation-123',
    });
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'rag_retrieval_cache_lookup',
      expect.objectContaining({ cacheName: 'rag_retrieval' }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'rag_retrieval_cache_write',
      expect.objectContaining({ cacheName: 'rag_retrieval' }),
      expect.any(Function)
    );
  });

  it('falls back to retrieval when Redis lookup fails', async () => {
    const documents = [
      {
        id: 'bird-resque1',
        name: 'Resplendent Quetzal',
      },
    ];
    const retriever = {
      retrieve: jest.fn().mockResolvedValue(documents),
    };
    const retrievalCache = {
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RagService({
      retriever,
      retrievalCache,
      redisConfig: { retrievalCacheTtlSeconds: 90 },
      log: logger,
    });

    await expect(service.retrieveContext('Where can I see quetzals?', {
      conversationId: 'conversation-123',
    })).resolves.toEqual(documents);

    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('RAG retrieval cache lookup failed', {
      conversationId: 'conversation-123',
      error: 'Redis unavailable',
    });
  });

  it('continues retrieval when Redis cache write fails', async () => {
    const documents = [
      {
        id: 'bird-resque1',
        name: 'Resplendent Quetzal',
      },
    ];
    const retriever = {
      retrieve: jest.fn().mockResolvedValue(documents),
    };
    const retrievalCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('Redis write failed')),
    };
    const service = new RagService({
      retriever,
      retrievalCache,
      redisConfig: { retrievalCacheTtlSeconds: 90 },
      log: logger,
    });

    await expect(service.retrieveContext('Where can I see quetzals?', {
      conversationId: 'conversation-123',
    })).resolves.toEqual(documents);

    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('RAG retrieval cache write failed', {
      conversationId: 'conversation-123',
      error: 'Redis write failed',
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
    expect(context.ragTrace).toMatchObject({
      retrievedChunkCount: 1,
      sourceCount: 1,
      originalMessageCount: 2,
      groundedMessageCount: 3,
      contextMessageLength: expect.any(Number),
      retrievedChunks: [
        expect.objectContaining({
          index: 0,
          id: 'Resplendent Quetzal',
          name: 'Resplendent Quetzal',
          similarityScore: 0.98,
          textLength: expect.any(Number),
        }),
      ],
    });
    expect(context.ragTrace.contextMessageLength).toBeGreaterThan(0);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: undefined,
      anonymousId: 'conversation:conversation-123',
      event: 'rag_query_executed',
      properties: {
        conversationId: 'conversation-123',
        latencyMs: expect.any(Number),
        model: expect.any(String),
        ragUsed: true,
        retrievedChunkCount: 1,
        source: 'chat',
      },
    });
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
    expect(logger.info).toHaveBeenCalledWith('RAG retrieved chunks for chat', {
      event: 'rag_retrieved_chunks',
      conversationId: 'conversation-123',
      chunkCount: 1,
      chunks: [
        expect.objectContaining({
          name: 'Resplendent Quetzal',
          similarityScore: 0.98,
        }),
      ],
    });
    expect(logger.info).toHaveBeenCalledWith('RAG grounding context assembled for chat', {
      event: 'rag_grounding_context_assembled',
      conversationId: 'conversation-123',
      retrievedChunkCount: 1,
      sourceCount: 1,
      contextMessageLength: expect.any(Number),
      groundedMessageCount: 3,
    });
  });

  it('returns original messages when retrieval fails', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    mockRetrieve.mockRejectedValue(new Error('PostgreSQL unavailable'));

    await expect(ragService.buildContext(messages, 'Where can I see quetzals?'))
      .resolves.toMatchObject({
        messages,
        sources: [],
        birdMatches: [],
        ragTrace: {
          retrievedChunkCount: 0,
          sourceCount: 0,
          groundedMessageCount: 2,
          error: 'rag_retrieval_failed',
        },
      });
    expect(logger.warn).toHaveBeenCalledWith('AI error monitored', expect.objectContaining({
      event: 'retrieval_failed',
      queryLength: 'Where can I see quetzals?'.length,
      error: expect.objectContaining({
        name: 'Error',
        message: '[redacted]',
      }),
    }));
  });

  it('returns original messages when pgvector has no matching documents', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    mockRetrieve.mockResolvedValue([]);

    await expect(ragService.buildContext(messages, 'Where can I see quetzals?'))
      .resolves.toMatchObject({
        messages,
        sources: [],
        birdMatches: [],
        ragTrace: {
          retrievedChunkCount: 0,
          sourceCount: 0,
          originalMessageCount: 2,
          groundedMessageCount: 2,
          contextMessageLength: 0,
          retrievedChunks: [],
          sources: [],
        },
      });
  });

  it('summarizes retrieved chunks without raw prompt context text', () => {
    expect(summarizeRetrievedChunks([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        chunkId: 'chunk-a',
        chunkIndex: 2,
        name: 'Resplendent Quetzal',
        source: 'birds.json',
        category: 'Trogons',
        documentType: 'bird_profile',
        locations: 'Monteverde',
        score: 0.987654321,
        semanticScore: 0.9123456,
        keywordScore: 0.25,
        text: 'Sensitive retrieved context body that should not be logged.',
      },
    ])).toEqual([
      {
        index: 0,
        id: 'chunk-1',
        documentId: 'doc-1',
        chunkId: 'chunk-a',
        chunkIndex: 2,
        name: 'Resplendent Quetzal',
        source: 'birds.json',
        category: 'Trogons',
        documentType: 'bird_profile',
        locations: 'Monteverde',
        similarityScore: 0.987654,
        semanticScore: 0.912346,
        keywordScore: 0.25,
        textLength: 59,
      },
    ]);
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
