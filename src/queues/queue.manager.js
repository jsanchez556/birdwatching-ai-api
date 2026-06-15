import { Queue, QueueEvents } from 'bullmq';
import { attachQueueEvents } from '../events/queue.events.js';
import {
  getQueueNameForJobType,
  isKnownJobType,
} from '../jobs/jobTypes.js';
import { buildJobOptions } from '../jobs/jobOptions.js';
import {
  buildBullMqJobOptions,
  getBullMqConfig,
} from './bullmq.config.js';
import { buildDeadLetterPayload } from './deadLetter.service.js';
import backgroundJobTracer, { buildQueueMetadata } from '../tracing/backgroundJobTracing.js';
import logger from '../utils/logger.js';

class QueueManager {
  constructor({
    QueueClass = Queue,
    QueueEventsClass = QueueEvents,
    config = getBullMqConfig(),
    logger: queueLogger = logger,
    tracer = backgroundJobTracer,
  } = {}) {
    this.QueueClass = QueueClass;
    this.QueueEventsClass = QueueEventsClass;
    this.config = config;
    this.logger = queueLogger;
    this.tracer = tracer;
    this.queues = new Map();
    this.queueEvents = new Map();
    this.defaultJobOptions = buildBullMqJobOptions(config);
  }

  registerQueue(queueName, options = {}) {
    if (!queueName) {
      throw new Error('queueName is required');
    }

    if (this.queues.has(queueName)) {
      return this.queues.get(queueName);
    }

    const queueOptions = {
      connection: this.config.connection,
      prefix: this.config.prefix,
      defaultJobOptions: buildJobOptions({
        ...this.defaultJobOptions,
        ...(options.defaultJobOptions || {}),
      }),
      ...(options.queueOptions || {}),
    };
    const queue = new this.QueueClass(queueName, queueOptions);

    this.queues.set(queueName, queue);
    if (options.registerEvents !== false) {
      this.registerQueueEvents(queueName, options);
    }

    this.logger.info?.('Queue registered', { queueName });
    this.tracer.recordEvent?.('bullmq_queue_registered', {
      queueName,
      hasQueueEvents: options.registerEvents !== false,
    }, {
      status: 'registered',
    });

    return queue;
  }

  registerQueueEvents(queueName, options = {}) {
    if (!this.QueueEventsClass || this.queueEvents.has(queueName)) {
      return this.queueEvents.get(queueName);
    }

    const queueEvents = new this.QueueEventsClass(queueName, {
      connection: this.config.connection,
      prefix: this.config.prefix,
      ...(options.queueEventsOptions || {}),
    });

    attachQueueEvents({
      config: this.config,
      deadLetterService: {
        enqueueFromFailure: ({ queueName: failedQueueName, job, failedReason }) => {
          const payload = buildDeadLetterPayload({
            queueName: failedQueueName,
            job,
            error: {
              name: 'JobFailed',
              message: failedReason,
            },
          });

          const deadLetterQueue = this.getQueue(this.config.deadLetter?.queueName || 'dead-letter');

          return deadLetterQueue.add('dead-letter', payload, {
            jobId: `dlq-${payload.originalQueueName}-${payload.jobId}-${payload.attemptsMade}`,
            attempts: 1,
          });
        },
      },
      queue: this.queues.get(queueName),
      queueEvents,
      queueName,
      logger: this.logger,
      tracer: this.tracer,
    });

    this.queueEvents.set(queueName, queueEvents);

    return queueEvents;
  }

  getQueue(queueName) {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not registered: ${queueName}`);
    }

    return queue;
  }

  getQueueForJobType(jobType) {
    const queueName = getQueueNameForJobType(jobType);

    if (!queueName) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    return this.getQueue(queueName);
  }

  async addJob(jobType, payload = {}, options = {}) {
    if (!isKnownJobType(jobType)) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    const queue = this.getQueueForJobType(jobType);
    const jobOptions = buildJobOptions({
      ...this.defaultJobOptions,
      ...(options.jobOptions || {}),
    });

    return this.tracer.traceOperation?.(
      'bullmq_job_enqueue',
      buildQueueMetadata({
        queueName: getQueueNameForJobType(jobType),
        jobType,
        jobId: options.id,
        extra: {
          attempts: jobOptions.attempts,
          backoffType: jobOptions.backoff?.type,
          backoffDelayMs: jobOptions.backoff?.delay,
        },
      }),
      () => queue.add(jobType, payload, {
        ...jobOptions,
        ...(options.id ? { jobId: options.id } : {}),
      }),
      {
        outputMetadata: (job = {}) => ({
          status: 'queued',
          jobId: job.id,
          jobType,
          queueName: getQueueNameForJobType(jobType),
        }),
      }
    ) || queue.add(jobType, payload, {
      ...jobOptions,
      ...(options.id ? { jobId: options.id } : {}),
    });
  }

  async close() {
    const closeErrors = [];

    for (const [queueName, queueEvents] of this.queueEvents.entries()) {
      try {
        await queueEvents.close?.();
      } catch (error) {
        closeErrors.push(error);
        this.logger.warn?.('Queue events close failed', {
          queueName,
          error: error?.message,
        });
      }
    }

    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await queue.close?.();
      } catch (error) {
        closeErrors.push(error);
        this.logger.warn?.('Queue close failed', {
          queueName,
          error: error?.message,
        });
      }
    }

    this.queueEvents.clear();
    this.queues.clear();

    if (closeErrors.length > 0) {
      throw closeErrors[0];
    }
  }
}

const queueManager = new QueueManager();

export {
  QueueManager,
};
export default queueManager;
