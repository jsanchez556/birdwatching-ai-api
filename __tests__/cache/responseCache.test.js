import { createResponseCache } from '../../src/cache/responseCache.js';
import { createRetrievalCache } from '../../src/cache/retrievalCache.js';
import { getRedisConfig } from '../../src/cache/redisClient.js';

const createFakeRedisClient = () => {
  const values = new Map();
  const calls = [];

  return {
    calls,
    isOpen: true,
    async get(key) {
      calls.push(['get', key]);
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      calls.push(['set', key, value, options]);
      values.set(key, value);
    },
    async del(key) {
      calls.push(['del', key]);
      values.delete(key);
    },
    async quit() {
      calls.push(['quit']);
      this.isOpen = false;
    },
  };
};

describe('response cache', () => {
  const config = {
    keyPrefix: 'test:',
    defaultTtlSeconds: 60,
  };

  it('sets and gets JSON values with the response namespace', async () => {
    const client = createFakeRedisClient();
    const cache = createResponseCache({ client, config });

    await cache.set('abc', { answer: 'motmot' });
    const value = await cache.get('abc');

    expect(value).toEqual({ answer: 'motmot' });
    expect(client.calls).toEqual([
      ['set', 'test:responses:abc', '{"answer":"motmot"}', { EX: 60 }],
      ['get', 'test:responses:abc'],
    ]);
  });

  it('can write values without expiration for explicit no-TTL calls', async () => {
    const client = createFakeRedisClient();
    const cache = createResponseCache({ client, config });

    await cache.set('abc', { answer: 'quetzal' }, { ttlSeconds: 0 });

    expect(client.calls).toEqual([
      ['set', 'test:responses:abc', '{"answer":"quetzal"}', undefined],
    ]);
  });

  it('supports deletion and clean disconnects', async () => {
    const client = createFakeRedisClient();
    const cache = createResponseCache({ client, config });

    await cache.set('abc', 'cached');
    await cache.delete('abc');
    await cache.disconnect();

    expect(await cache.get('abc')).toBeNull();
    expect(client.calls).toContainEqual(['del', 'test:responses:abc']);
    expect(client.calls).toContainEqual(['quit']);
  });

  it('uses the retrieval namespace for retrieval cache keys', async () => {
    const client = createFakeRedisClient();
    const cache = createRetrievalCache({ client, config });

    await cache.set('bird:quetzal', ['cloud forest']);

    expect(client.calls[0]).toEqual([
      'set',
      'test:retrieval:bird:quetzal',
      '["cloud forest"]',
      { EX: 60 },
    ]);
  });

  it('keeps retrieval cache get/set behavior compatible with response cache values', async () => {
    const client = createFakeRedisClient();
    const cache = createRetrievalCache({ client, config });

    await cache.set('query:quetzal', [{ id: 'bird-resque1' }]);

    await expect(cache.get('query:quetzal')).resolves.toEqual([
      { id: 'bird-resque1' },
    ]);
  });

  it('reads retrieval cache TTL from the environment', () => {
    expect(getRedisConfig({
      RETRIEVAL_CACHE_TTL_SECONDS: '900',
    })).toMatchObject({
      retrievalCacheTtlSeconds: 900,
    });
  });

  it('reads semantic cache config from the environment', () => {
    expect(getRedisConfig({
      SEMANTIC_CACHE_TTL_SECONDS: '600',
      SEMANTIC_CACHE_SIMILARITY_THRESHOLD: '0.88',
      SEMANTIC_CACHE_MAX_ENTRIES: '25',
    })).toMatchObject({
      semanticCacheTtlSeconds: 600,
      semanticCacheSimilarityThreshold: 0.88,
      semanticCacheMaxEntries: 25,
    });
  });

  it('reads embedding cache TTL from the environment', () => {
    expect(getRedisConfig({
      EMBEDDING_CACHE_TTL_SECONDS: '3600',
    })).toMatchObject({
      embeddingCacheTtlSeconds: 3600,
    });
  });
});
