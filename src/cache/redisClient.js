import { parsePositiveInteger, parsePositiveNumber } from '../utils/number.utils.js';

export const getRedisConfig = (env = process.env) => ({
  url: env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: env.REDIS_KEY_PREFIX || 'birdwatching-ai:',
  defaultTtlSeconds: parsePositiveInteger(env.REDIS_CACHE_TTL_SECONDS, 300),
  responseCacheTtlSeconds: parsePositiveInteger(env.AI_RESPONSE_CACHE_TTL_SECONDS, 300),
  retrievalCacheTtlSeconds: parsePositiveInteger(env.RETRIEVAL_CACHE_TTL_SECONDS, 300),
  semanticCacheTtlSeconds: parsePositiveInteger(env.SEMANTIC_CACHE_TTL_SECONDS, 300),
  semanticCacheSimilarityThreshold: parsePositiveNumber(env.SEMANTIC_CACHE_SIMILARITY_THRESHOLD, 0.92),
  semanticCacheMaxEntries: parsePositiveInteger(env.SEMANTIC_CACHE_MAX_ENTRIES, 100),
  embeddingCacheTtlSeconds: parsePositiveInteger(env.EMBEDDING_CACHE_TTL_SECONDS, 86400),
});

export const createRedisClient = async ({
  config = getRedisConfig(),
  clientFactory,
  logger = console,
} = {}) => {
  const createClient =
    clientFactory ||
    (await import('redis').then(({ createClient: redisCreateClient }) => redisCreateClient));

  const client = createClient({ url: config.url });

  client.on?.('error', (error) => {
    logger.warn?.('Redis client error', {
      error: error?.message,
    });
  });

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
};

export default createRedisClient;
