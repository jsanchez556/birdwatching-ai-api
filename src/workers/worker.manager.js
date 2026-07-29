import { Worker } from 'bullmq';
import { attachWorkerEvents } from '../events/queue.events.js';
import { getBullMqConfig } from '../queues/bullmq.config.js';
import backgroundJobTracer, { buildQueueMetadata } from '../tracing/backgroundJobTracing.js';
import logger from '../utils/logger.js';

class WorkerManager {
  constructor({
    WorkerClass = Worker,
    config = getBullMqConfig(),
    logger: workerLogger = logger,
    tracer = backgroundJobTracer,
  } = {}) {
    this.WorkerClass = WorkerClass;
    this.config = config;
    this.logger = workerLogger;
    this.tracer = tracer;
    this.workers = new Map();
  }

  registerWorker({
    queueName,
    workerName,
    processor,
    options = {},
  } = {}) {
    if (!queueName) {
      throw new Error('queueName is required');
    }

    if (!workerName) {
      throw new Error('workerName is required');
    }

    if (typeof processor !== 'function') {
      throw new Error('processor must be a function');
    }

    if (this.workers.has(workerName)) {
      return this.workers.get(workerName);
    }

    const tracedProcessor = (job) => this.tracer.traceOperation?.(
      'bullmq_worker_execution',
      buildQueueMetadata({
        queueName,
        workerName,
        job,
      }),
      () => processor(job),
      {
        outputMetadata: (result = {}) => ({
          status: result?.status || 'completed',
          queueName,
          workerName,
          jobId: job?.id,
          jobName: job?.name,
        }),
      }
    ) || processor(job);

    const worker = new this.WorkerClass(queueName, tracedProcessor, {
      connection: this.config.connection,
      prefix: this.config.prefix,
      concurrency: this.config.workerConcurrency,
      autorun: false,
      ...options,
    });

    attachWorkerEvents({
      worker,
      queueName,
      workerName,
      logger: this.logger,
      tracer: this.tracer,
    });

    this.workers.set(workerName, worker);
    this.logger.info?.('Worker registered', {
      queueName,
      workerName,
    });

    return worker;
  }

  getWorker(workerName) {
    const worker = this.workers.get(workerName);

    if (!worker) {
      throw new Error(`Worker not registered: ${workerName}`);
    }

    return worker;
  }

  async startWorker(workerName) {
    const worker = this.getWorker(workerName);

    await worker.run?.();

    this.logger.info?.('Worker started', { workerName });

    return worker;
  }

  async startAll() {
    const workers = [];

    for (const workerName of this.workers.keys()) {
      workers.push(await this.startWorker(workerName));
    }

    return workers;
  }

  async close() {
    const closeErrors = [];

    for (const [workerName, worker] of this.workers.entries()) {
      try {
        await worker.close?.();
      } catch (error) {
        closeErrors.push(error);
        this.logger.warn?.('Worker close failed', {
          workerName,
          error: error?.message,
        });
      }
    }

    this.workers.clear();

    if (closeErrors.length > 0) {
      throw closeErrors[0];
    }
  }
}

const workerManager = new WorkerManager();

export {
  WorkerManager,
};
export default workerManager;
