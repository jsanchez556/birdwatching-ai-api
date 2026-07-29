import createRedisClient, { getRedisConfig } from './redisClient.js';

const serialize = (value) => JSON.stringify(value);

const deserialize = (value) => {
  if (value == null) {
    return null;
  }

  return JSON.parse(value);
};

export const createResponseCache = ({
  client,
  config = getRedisConfig(),
  namespace = 'responses',
} = {}) => {
  let redisClient = client;

  const getClient = async () => {
    if (!redisClient) {
      redisClient = await createRedisClient({ config });
    }

    return redisClient;
  };

  const buildKey = (key) => `${config.keyPrefix}${namespace}:${key}`;

  return {
    async get(key) {
      const value = await (await getClient()).get(buildKey(key));
      return deserialize(value);
    },

    async set(key, value, { ttlSeconds = config.defaultTtlSeconds } = {}) {
      const serialized = serialize(value);

      if (ttlSeconds) {
        await (await getClient()).set(buildKey(key), serialized, {
          EX: ttlSeconds,
        });
        return;
      }

      await (await getClient()).set(buildKey(key), serialized);
    },

    async delete(key) {
      await (await getClient()).del(buildKey(key));
    },

    async disconnect() {
      if (redisClient?.isOpen) {
        await redisClient.quit();
      }
    },
  };
};

export default createResponseCache;
