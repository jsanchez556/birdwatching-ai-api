import { jest } from '@jest/globals';
import {
  RedisFixedWindowStore,
  createLocalFixedWindowStore,
  createRateLimit,
} from '../src/api/middleware/rateLimit.middleware.js';

function response() {
  const headers = new Map();
  return {
    setHeader: jest.fn((name, value) => headers.set(name, value)),
    headers,
  };
}

function run(middleware, req = { ip: '203.0.113.5', path: '/chat' }) {
  const res = response();
  return new Promise((resolve) => {
    middleware(req, res, (error) => resolve({ error, res }));
  });
}

describe('distributed rate limiting', () => {
  test('enforces a shared limit across middleware replicas and returns stable headers', async () => {
    const clock = { now: jest.fn(() => 1000) };
    const store = createLocalFixedWindowStore({ clock });
    const options = {
      maxRequests: 2,
      windowMs: 5000,
      store,
      fallbackStore: store,
      clock,
    };
    const replicaA = createRateLimit(options);
    const replicaB = createRateLimit(options);

    const [first, second] = await Promise.all([run(replicaA), run(replicaB)]);
    const blocked = await run(replicaA);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(blocked.error).toMatchObject({ status: 429 });
    expect(blocked.res.headers.get('Retry-After')).toBe('5');
    expect(blocked.res.headers.get('RateLimit-Limit')).toBe('2');
    expect(blocked.res.headers.get('RateLimit-Remaining')).toBe('0');
  });

  test('starts a new bounded local window after expiration', async () => {
    let now = 1000;
    const store = createLocalFixedWindowStore({
      clock: { now: () => now },
      maxBuckets: 1,
    });
    const limiter = createRateLimit({
      maxRequests: 1,
      windowMs: 1000,
      store,
      fallbackStore: store,
      clock: { now: () => now },
    });

    expect((await run(limiter)).error).toBeUndefined();
    expect((await run(limiter)).error.status).toBe(429);
    now = 2000;
    expect((await run(limiter)).error).toBeUndefined();
    await run(limiter, { ip: '198.51.100.2', path: '/chat' });
    expect(store.size()).toBe(1);
  });

  test('uses one atomic Redis script with an expiring hashed key', async () => {
    const client = {
      eval: jest.fn().mockResolvedValue([1, 60000]),
    };
    const store = new RedisFixedWindowStore({
      clientProvider: async () => client,
      keyPrefix: 'test:rate:',
    });

    await store.increment('global', 'customer@example.test', 60000);

    expect(client.eval).toHaveBeenCalledTimes(1);
    const [, options] = client.eval.mock.calls[0];
    expect(options.arguments).toEqual(['60000']);
    expect(options.keys[0]).toMatch(/^test:rate:global:[a-f0-9]{64}$/);
    expect(options.keys[0]).not.toContain('customer@example.test');
  });

  test('falls back locally without leaking Redis failures and supports fail-closed mode', async () => {
    const failingStore = { increment: jest.fn().mockRejectedValue(new Error('redis://secret')) };
    const fallbackStore = createLocalFixedWindowStore();
    const log = { warn: jest.fn() };

    const available = await run(createRateLimit({
      store: failingStore,
      fallbackStore,
      log,
      failureMode: 'local',
    }));
    const denied = await run(createRateLimit({
      store: failingStore,
      fallbackStore,
      log,
      failureMode: 'deny',
    }));

    expect(available.error).toBeUndefined();
    expect(denied.error).toMatchObject({ status: 503 });
    expect(log.warn).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      error: expect.anything(),
    }));
  });

  test('bounds a stalled Redis operation before applying the availability fallback', async () => {
    const stalledStore = { increment: () => new Promise(() => {}) };
    const result = await run(createRateLimit({
      store: stalledStore,
      fallbackStore: createLocalFixedWindowStore(),
      operationTimeoutMs: 5,
      failureMode: 'local',
      log: {},
    }));

    expect(result.error).toBeUndefined();
    expect(result.res.headers.get('RateLimit-Remaining')).toBe('59');
  });
});
