import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/ai/orchestrators/agent.orchestrator.js', () => ({
  default: {
    generateResponse: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/openai.client.js', () => ({
  default: {
    generateEmbedding: jest.fn(),
  },
}));

const mockTraceCacheOperation = jest.fn(async (name, metadata, operation) => operation());

await jest.unstable_mockModule('../src/tracing/aiTracing.middleware.js', () => ({
  traceCacheOperation: mockTraceCacheOperation,
}));

const {
  OpenAIService,
  cosineSimilarity,
  formatCurrency,
  formatPercent,
  pruneSemanticEntries,
} = await import('../src/ai/openai.service.js');

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createRedisConfig = (overrides = {}) => ({
  responseCacheTtlSeconds: 60,
  semanticCacheTtlSeconds: 120,
  semanticCacheSimilarityThreshold: 0.92,
  semanticCacheMaxEntries: 100,
  ...overrides,
});

describe('OpenAIService response caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates cosine similarity for semantic cache comparisons', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('formats cost optimization metric values', () => {
    expect(formatPercent(74, 100)).toBe('74%');
    expect(formatCurrency(23.42)).toBe('$23.42');
  });

  it('prunes expired semantic cache entries', () => {
    expect(pruneSemanticEntries([
      { response: 'expired', embedding: [1], createdAt: 1, expiresAt: 10 },
      { response: 'fresh', embedding: [1], createdAt: 2, expiresAt: 30 },
    ], {
      now: 20,
      maxEntries: 10,
    })).toEqual([
      { response: 'fresh', embedding: [1], createdAt: 2, expiresAt: 30 },
    ]);
  });

  it('returns a cached AI response before calling OpenAI', async () => {
    const orchestrator = {
      generateResponse: jest.fn(),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue({
        response: 'Cached quetzal answer.',
      }),
      set: jest.fn(),
    };
    const logger = createLogger();
    const onChunk = jest.fn();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient: {
        generateEmbedding: jest.fn(),
      },
      redisConfig: createRedisConfig(),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Tell me about quetzals.' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      { onChunk }
    );

    expect(response).toBe('Cached quetzal answer.');
    expect(onChunk).toHaveBeenCalledWith('Cached quetzal answer.');
    expect(orchestrator.generateResponse).not.toHaveBeenCalled();
    expect(responseCache.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('CACHE HIT', {
      conversationId: 'conversation-123',
    });
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'ai_response_cache_lookup',
      expect.objectContaining({
        conversationId: 'conversation-123',
        cacheName: 'ai_response',
        cacheEligible: true,
      }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).not.toHaveBeenCalledWith(
      'semantic_response_cache_lookup',
      expect.any(Object),
      expect.any(Function)
    );
    expect(service.getCostOptimizationMetrics()).toEqual({
      cacheHits: 1,
      cacheMisses: 0,
      cacheHitRate: '100%',
      estimatedSavings: '$0.00',
    });
  });

  it('writes a cache entry after an uncached OpenAI response', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Fresh motmot answer.'),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig({
        responseCacheTtlSeconds: 120,
        semanticCacheTtlSeconds: 240,
      }),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Tell me about motmots.' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    );

    expect(response).toBe('Fresh motmot answer.');
    expect(orchestrator.generateResponse).toHaveBeenCalledTimes(1);
    expect(embeddingClient.generateEmbedding).toHaveBeenCalledWith(['Tell me about motmots.']);
    expect(responseCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-response:[a-f0-9]{64}$/),
      {
        response: 'Fresh motmot answer.',
        promptVersion: '2.3.0',
        estimatedCostUsd: 0,
      },
      {
        ttlSeconds: 120,
      }
    );
    expect(logger.info).toHaveBeenCalledWith('CACHE MISS', {
      conversationId: 'conversation-123',
      cacheEligible: true,
    });
    expect(logger.info).toHaveBeenCalledWith('AI response cached', {
      conversationId: 'conversation-123',
      ttlSeconds: 120,
    });
    expect(logger.info).toHaveBeenCalledWith('Semantic cache write', {
      conversationId: 'conversation-123',
      ttlSeconds: 240,
      entryCount: 1,
    });
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'ai_response_cache_lookup',
      expect.objectContaining({ cacheName: 'ai_response' }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'semantic_response_cache_lookup',
      expect.objectContaining({ cacheName: 'semantic_response' }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'ai_response_cache_write',
      expect.objectContaining({ cacheName: 'ai_response' }),
      expect.any(Function)
    );
    expect(mockTraceCacheOperation).toHaveBeenCalledWith(
      'semantic_response_cache_write',
      expect.objectContaining({ cacheName: 'semantic_response' }),
      expect.any(Function)
    );
  });

  it('tracks cache misses and stores estimated provider cost for future savings', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockImplementation(async (messages, metadata, options) => {
        options.usage.openAiUsage = {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          estimatedCostUsd: 0.42,
          estimatedCostDisplay: '$0.4200',
          hasEstimatedCost: true,
        };
        return 'Fresh answer with cost.';
      }),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig(),
      log: createLogger(),
    });

    await service.streamResponseWithTools(
      [{ role: 'user', content: 'Where can I see quetzals?' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    );

    expect(responseCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-response:[a-f0-9]{64}$/),
      expect.objectContaining({
        response: 'Fresh answer with cost.',
        estimatedCostUsd: 0.42,
      }),
      expect.any(Object)
    );
    expect(service.getCostOptimizationMetrics()).toEqual({
      cacheHits: 0,
      cacheMisses: 1,
      cacheHitRate: '0%',
      estimatedSavings: '$0.00',
    });
  });

  it('returns a semantic cached response before calling OpenAI', async () => {
    const orchestrator = {
      generateResponse: jest.fn(),
    };
    const responseCache = {
      get: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([
          {
            scope: {
              promptVersion: '2.3.0',
              role: 'visitor',
            },
            embedding: [0.99, 0.01],
            response: 'Cached quetzal answer.',
            estimatedCostUsd: 23.42,
            createdAt: Date.now(),
          },
        ]),
      set: jest.fn(),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const logger = createLogger();
    const onChunk = jest.fn();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig({
        semanticCacheSimilarityThreshold: 0.95,
      }),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Best place to watch quetzals?' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      { onChunk }
    );

    expect(response).toBe('Cached quetzal answer.');
    expect(onChunk).toHaveBeenCalledWith('Cached quetzal answer.');
    expect(orchestrator.generateResponse).not.toHaveBeenCalled();
    expect(responseCache.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('CACHE HIT', {
      cache: 'semantic_response',
      conversationId: 'conversation-123',
      similarity: expect.any(Number),
    });
    expect(service.getCostOptimizationMetrics()).toEqual({
      cacheHits: 1,
      cacheMisses: 0,
      cacheHitRate: '100%',
      estimatedSavings: '$23.42',
    });
  });

  it('treats below-threshold semantic matches as cache misses', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Fresh quetzal answer.'),
    };
    const responseCache = {
      get: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([
          {
            scope: {
              promptVersion: '2.3.0',
              role: 'visitor',
            },
            embedding: [0, 1],
            response: 'Cached unrelated answer.',
          },
        ])
        .mockResolvedValueOnce([]),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig({
        semanticCacheSimilarityThreshold: 0.95,
      }),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Where can I see quetzals?' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    );

    expect(response).toBe('Fresh quetzal answer.');
    expect(orchestrator.generateResponse).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Semantic cache miss', {
      conversationId: 'conversation-123',
      threshold: 0.95,
    });
  });

  it('skips writing cache entries after tool metadata is produced', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockImplementation(async (messages, metadata) => {
        metadata.toolsCalled = ['searchTours'];
        return 'I found tours.';
      }),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig(),
      log: createLogger(),
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Find tours.' }],
      { conversationId: 'conversation-123', role: 'customer' },
      {}
    );

    expect(response).toBe('I found tours.');
    expect(responseCache.get).toHaveBeenCalledTimes(2);
    expect(responseCache.set).not.toHaveBeenCalled();
  });

  it('skips cache lookup for authenticated user metadata', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Private-context answer.'),
    };
    const responseCache = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient: {
        generateEmbedding: jest.fn(),
      },
      redisConfig: createRedisConfig(),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'What did I ask earlier?' }],
      { conversationId: 'conversation-123', role: 'customer', userId: '7' },
      {}
    );

    expect(response).toBe('Private-context answer.');
    expect(responseCache.get).not.toHaveBeenCalled();
    expect(responseCache.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Semantic cache skipped', {
      conversationId: 'conversation-123',
      reason: 'cache_ineligible',
    });
    expect(logger.info).toHaveBeenCalledWith('CACHE MISS', {
      conversationId: 'conversation-123',
      cacheEligible: false,
    });
  });

  it('falls back to OpenAI when cache lookup fails', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Fresh fallback answer.'),
    };
    const responseCache = {
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig(),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Where do tanagers live?' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    );

    expect(response).toBe('Fresh fallback answer.');
    expect(orchestrator.generateResponse).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('AI response cache lookup failed', {
      conversationId: 'conversation-123',
      error: 'Redis unavailable',
    });
    expect(logger.warn).toHaveBeenCalledWith('Semantic cache lookup failed', {
      conversationId: 'conversation-123',
      error: 'Redis unavailable',
    });
  });

  it('falls back to OpenAI when semantic embedding generation fails', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Fresh fallback answer.'),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn().mockRejectedValue(new Error('Embedding unavailable')),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig(),
      log: logger,
    });

    const response = await service.streamResponseWithTools(
      [{ role: 'user', content: 'Where can I see quetzals?' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    );

    expect(response).toBe('Fresh fallback answer.');
    expect(orchestrator.generateResponse).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Semantic cache embedding generation failed', {
      conversationId: 'conversation-123',
      error: 'Embedding unavailable',
    });
  });

  it('logs semantic cache skipped when no user question is present', async () => {
    const orchestrator = {
      generateResponse: jest.fn().mockResolvedValue('Fresh fallback answer.'),
    };
    const responseCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingClient = {
      generateEmbedding: jest.fn(),
    };
    const logger = createLogger();
    const service = new OpenAIService({
      orchestrator,
      responseCache,
      embeddingClient,
      redisConfig: createRedisConfig(),
      log: logger,
    });

    await expect(service.streamResponseWithTools(
      [{ role: 'system', content: 'Base prompt' }],
      { conversationId: 'conversation-123', role: 'visitor' },
      {}
    )).resolves.toBe('Fresh fallback answer.');

    expect(embeddingClient.generateEmbedding).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Semantic cache skipped', {
      conversationId: 'conversation-123',
      reason: 'missing_question',
    });
  });
});
