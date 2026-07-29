import createRedisClient, { getRedisConfig } from './redisClient.js';
import logger from '../utils/logger.js';

let clientPromise = null;
let retryAfter = 0;

async function getRuntimeRedisClient({
  clock = Date,
  createClient = createRedisClient,
  log = logger,
  retryDelayMs = 5000,
} = {}) {
  if (clientPromise) return clientPromise;
  if (clock.now() < retryAfter) {
    throw new Error('Redis connection retry is temporarily delayed');
  }

  clientPromise = createClient({
    config: getRedisConfig(),
    logger: log,
  }).catch((error) => {
    clientPromise = null;
    retryAfter = clock.now() + retryDelayMs;
    throw error;
  });

  return clientPromise;
}

async function closeRuntimeRedisClient() {
  const pendingClient = clientPromise;
  clientPromise = null;
  retryAfter = 0;

  if (!pendingClient) return;

  const client = await pendingClient.catch(() => null);
  if (client?.isOpen) {
    await client.quit();
  }
}

function resetRuntimeRedisClientForTests() {
  clientPromise = null;
  retryAfter = 0;
}

export {
  closeRuntimeRedisClient,
  getRuntimeRedisClient,
  resetRuntimeRedisClientForTests,
};
