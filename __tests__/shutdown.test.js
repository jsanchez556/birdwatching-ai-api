import { jest } from '@jest/globals';
import { createShutdownController } from '../src/runtime/shutdown.js';

describe('bounded graceful shutdown', () => {
  test('marks unready, drains, and closes resources in order', async () => {
    const order = [];
    const shutdown = createShutdownController({
      markUnready: () => order.push('unready'),
      stopAccepting: async () => order.push('drain'),
      cleanupTasks: [
        { name: 'redis', close: async () => order.push('redis') },
        { name: 'postgres', close: async () => order.push('postgres') },
      ],
      graceMs: 100,
      hardTimeoutMs: 200,
      log: {},
    });

    await expect(shutdown('SIGTERM')).resolves.toEqual({ exitCode: 0, forced: false });
    expect(order).toEqual(['unready', 'drain', 'redis', 'postgres']);
  });

  test('is idempotent for repeated signals', async () => {
    const stopAccepting = jest.fn().mockResolvedValue();
    const shutdown = createShutdownController({
      stopAccepting,
      graceMs: 100,
      hardTimeoutMs: 200,
      log: {},
    });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    expect(second).toBe(first);
    await first;
    expect(stopAccepting).toHaveBeenCalledTimes(1);
  });

  test('forces stalled active work after the grace period', async () => {
    const forceStop = jest.fn();
    const shutdown = createShutdownController({
      stopAccepting: () => new Promise((resolve) => {
        setTimeout(resolve, 25);
      }),
      forceStop,
      graceMs: 5,
      hardTimeoutMs: 50,
      log: {},
    });

    const result = await shutdown();
    expect(result).toEqual({ exitCode: 0, forced: true });
    expect(forceStop).toHaveBeenCalledTimes(1);
  });

  test('returns a failure exit code at the hard deadline', async () => {
    const forceStop = jest.fn();
    const shutdown = createShutdownController({
      stopAccepting: () => new Promise(() => {}),
      forceStop,
      graceMs: 5,
      hardTimeoutMs: 15,
      log: {},
    });

    await expect(shutdown()).resolves.toEqual({ exitCode: 1, forced: true });
    expect(forceStop).toHaveBeenCalledTimes(1);
  });
});
