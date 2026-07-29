class ShutdownTimeoutError extends Error {
  constructor(message = 'Shutdown deadline exceeded') {
    super(message);
    this.name = 'ShutdownTimeoutError';
  }
}

function createShutdownController({
  markUnready = () => {},
  stopAccepting = async () => {},
  forceStop = () => {},
  cleanupTasks = [],
  graceMs = 15000,
  hardTimeoutMs = 30000,
  log = console,
} = {}) {
  let shutdownPromise = null;

  return function shutdown(signal = 'shutdown') {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      markUnready();
      log.info?.('Graceful shutdown started', { signal });

      let graceTimer;
      let hardTimer;
      let forced = false;
      const invokeForceStop = () => {
        if (forced) return;
        forced = true;
        forceStop();
      };
      const hardDeadline = new Promise((resolve) => {
        hardTimer = setTimeout(() => {
          invokeForceStop();
          resolve({ exitCode: 1, forced: true });
        }, hardTimeoutMs);
        hardTimer.unref?.();
      });

      const orderlyShutdown = (async () => {
        graceTimer = setTimeout(() => {
          log.warn?.('Shutdown grace period exceeded; forcing active work closed');
          invokeForceStop();
        }, graceMs);
        graceTimer.unref?.();

        let exitCode = 0;
        try {
          await stopAccepting();
        } catch {
          exitCode = 1;
          log.error?.('Failed while draining active work');
        } finally {
          clearTimeout(graceTimer);
        }

        for (const task of cleanupTasks) {
          try {
            await task.close();
          } catch {
            exitCode = 1;
            log.error?.('Shutdown resource close failed', {
              resource: task.name,
            });
          }
        }

        return { exitCode, forced };
      })();

      const result = await Promise.race([orderlyShutdown, hardDeadline]);
      clearTimeout(graceTimer);
      clearTimeout(hardTimer);
      log.info?.('Graceful shutdown finished', result);
      return result;
    })();

    return shutdownPromise;
  };
}

export {
  ShutdownTimeoutError,
  createShutdownController,
};
