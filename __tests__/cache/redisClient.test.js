import { jest } from '@jest/globals';
import {
  createRedisClient,
  getRedisConfig,
} from '../../src/cache/redisClient.js';

describe('redis client', () => {
  it('uses safe defaults and environment overrides', () => {
    expect(getRedisConfig({
      REDIS_URL: 'redis://cache.example.test:6379',
      REDIS_KEY_PREFIX: 'test-prefix:',
      REDIS_CACHE_TTL_SECONDS: '120',
      AI_RESPONSE_CACHE_TTL_SECONDS: '240',
      RETRIEVAL_CACHE_TTL_SECONDS: '360',
      SEMANTIC_CACHE_TTL_SECONDS: '480',
      SEMANTIC_CACHE_SIMILARITY_THRESHOLD: '0.91',
      SEMANTIC_CACHE_MAX_ENTRIES: '42',
      EMBEDDING_CACHE_TTL_SECONDS: '600',
    })).toEqual({
      url: 'redis://cache.example.test:6379',
      keyPrefix: 'test-prefix:',
      defaultTtlSeconds: 120,
      responseCacheTtlSeconds: 240,
      retrievalCacheTtlSeconds: 360,
      semanticCacheTtlSeconds: 480,
      semanticCacheSimilarityThreshold: 0.91,
      semanticCacheMaxEntries: 42,
      embeddingCacheTtlSeconds: 600,
    });
  });

  it('connects an injected Redis client and attaches redacted error logging', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const on = jest.fn();
    const clientFactory = jest.fn(() => ({
      isOpen: false,
      connect,
      on,
    }));
    const logger = {
      warn: jest.fn(),
    };

    await expect(createRedisClient({
      config: { url: 'redis://secret-user:secret-pass@localhost:6379' },
      clientFactory,
      logger,
    })).resolves.toEqual(expect.objectContaining({
      connect,
      on,
    }));

    expect(clientFactory).toHaveBeenCalledWith({
      url: 'redis://secret-user:secret-pass@localhost:6379',
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));

    const errorHandler = on.mock.calls[0][1];
    errorHandler(new Error('connection refused'));

    expect(logger.warn).toHaveBeenCalledWith('Redis client error', {
      error: 'connection refused',
    });
  });

  it('does not reconnect an already-open injected Redis client', async () => {
    const connect = jest.fn();
    const client = {
      isOpen: true,
      connect,
      on: jest.fn(),
    };

    await createRedisClient({
      config: { url: 'redis://localhost:6379' },
      clientFactory: () => client,
    });

    expect(connect).not.toHaveBeenCalled();
  });
});
