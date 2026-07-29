import { jest } from '@jest/globals';
import { createReadinessChecker } from '../src/services/dependencyHealth.service.js';

describe('dependency readiness', () => {
  const database = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
  const redis = { ping: jest.fn().mockResolvedValue('PONG') };

  test('reports healthy required API dependencies', async () => {
    const check = createReadinessChecker({
      database,
      redisClientProvider: async () => redis,
      cacheTtlMs: 0,
      shutdownCheck: () => false,
    });

    await expect(check()).resolves.toEqual({
      status: 'ok',
      checks: {
        postgres: { status: 'ok' },
        redis: { status: 'ok' },
      },
    });
  });

  test.each([
    ['postgres', { query: jest.fn().mockRejectedValue(new Error('database secret')) }, async () => redis],
    ['redis', database, async () => { throw new Error('redis secret'); }],
  ])('reports unavailable without dependency error details when %s fails', async (
    dependency,
    failingDatabase,
    redisClientProvider
  ) => {
    const check = createReadinessChecker({
      database: failingDatabase,
      redisClientProvider,
      cacheTtlMs: 0,
      shutdownCheck: () => false,
    });
    const result = await check();

    expect(result.status).toBe('unavailable');
    expect(result.checks[dependency]).toEqual({ status: 'unavailable', reason: 'error' });
    expect(JSON.stringify(result)).not.toMatch(/secret/);
  });

  test('bounds stalled checks and coalesces probe load', async () => {
    const stalledDatabase = { query: jest.fn(() => new Promise(() => {})) };
    const check = createReadinessChecker({
      database: stalledDatabase,
      redisClientProvider: async () => redis,
      timeoutMs: 10,
      cacheTtlMs: 1000,
      shutdownCheck: () => false,
    });

    const [first, second] = await Promise.all([check(), check()]);
    expect(first.checks.postgres).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(second).toBe(first);
    expect(stalledDatabase.query).toHaveBeenCalledTimes(1);
  });

  test('becomes unavailable immediately during shutdown', async () => {
    const check = createReadinessChecker({ shutdownCheck: () => true });
    await expect(check()).resolves.toEqual({
      status: 'unavailable',
      checks: {
        process: { status: 'unavailable', reason: 'shutting_down' },
      },
    });
  });
});
