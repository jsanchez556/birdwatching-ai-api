import { parsePositiveInteger, parsePositiveNumber } from '../utils/number.utils.js';

export const getRedisConfig = (env = process.env) => ({
  url: env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: env.REDIS_KEY_PREFIX || 'birdwatching-ai:',
  connectionTimeoutMs: parsePositiveInteger(env.REDIS_CONNECT_TIMEOUT_MS, 1000),
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

  const client = createClient({
    url: config.url,
    socket: {
      connectTimeout: config.connectionTimeoutMs || 1000,
    },
  });

  client.on?.('error', (error) => {
    logger.warn?.('Redis client error', {
      code: typeof error?.code === 'string' ? error.code : 'REDIS_CLIENT_ERROR',
    });
  });

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
};

export default createRedisClient;
