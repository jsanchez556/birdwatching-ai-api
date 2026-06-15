const attachQueueEvents = ({
  config = {},
  deadLetterService,
  queue,
  queueEvents,
  queueName,
  logger = console,
  tracer,
} = {}) => {
  if (!queueEvents?.on) {
    return queueEvents;
  }

  queueEvents.on('completed', ({ jobId } = {}) => {
    logger.info?.('Queue job completed', {
      queueName,
      jobId,
    });
  });

  queueEvents.on('failed', async ({ jobId, failedReason, prev } = {}) => {
    logger.warn?.('Queue job failed', {
      queueName,
      jobId,
      error: failedReason,
    });

    try {
      const job = await queue?.getJob?.(jobId);
      const attemptsMade = Number(job?.attemptsMade || 0);
      const configuredAttempts = Number(job?.opts?.attempts || 0);
      const exhausted = configuredAttempts > 0 && attemptsMade >= configuredAttempts;

      tracer?.recordEvent?.('bullmq_job_failure', {
        queueName,
        jobId,
        jobName: job?.name,
        attemptsMade,
        configuredAttempts,
        previousStatus: prev,
      }, {
        status: exhausted ? 'failed_exhausted' : 'failed_retrying',
        errorName: 'JobFailed',
      });

      if (!exhausted) {
        tracer?.recordEvent?.('bullmq_job_retry_scheduled', {
          queueName,
          jobId,
          jobName: job?.name,
          nextAttempt: attemptsMade + 1,
          configuredAttempts,
          previousStatus: prev,
        }, {
          status: 'retry_scheduled',
        });
        return;
      }

      if (!deadLetterService || config.deadLetter?.enabled === false) {
        return;
      }

      await deadLetterService.enqueueFromFailure?.({
        queueName,
        job,
        failedReason,
        prev,
      });
      tracer?.recordEvent?.('bullmq_job_dead_lettered', {
        queueName,
        jobId,
        jobName: job?.name,
        attemptsMade,
        configuredAttempts,
      }, {
        status: 'dead_lettered',
      });
    } catch (error) {
      logger.warn?.('Dead-letter enqueue failed', {
        queueName,
        jobId,
        error: error?.message,
      });
    }
  });

  queueEvents.on('error', (error) => {
    logger.warn?.('Queue events error', {
      queueName,
      error: error?.message,
    });
  });

  return queueEvents;
};

const attachWorkerEvents = ({
  worker,
  queueName,
  workerName,
  logger = console,
  tracer,
} = {}) => {
  if (!worker?.on) {
    return worker;
  }

  worker.on('completed', (job) => {
    logger.info?.('Worker job completed', {
      queueName,
      workerName,
      jobId: job?.id,
      jobName: job?.name,
    });
  });

  worker.on('failed', (job, error) => {
    const attemptsMade = Number(job?.attemptsMade || 0);
    const configuredAttempts = Number(job?.opts?.attempts || 0);
    const willRetry = configuredAttempts > 0 && attemptsMade < configuredAttempts;

    logger.warn?.('Worker job failed', {
      queueName,
      workerName,
      jobId: job?.id,
      jobName: job?.name,
      error: error?.message,
    });
    tracer?.recordEvent?.('bullmq_worker_failure', {
      queueName,
      workerName,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade,
      configuredAttempts,
    }, {
      status: willRetry ? 'retry_scheduled' : 'failed',
      errorName: error?.name,
      errorCode: error?.code,
    });
  });

  worker.on('error', (error) => {
    logger.warn?.('Worker error', {
      queueName,
      workerName,
      error: error?.message,
    });
  });

  return worker;
};

export {
  attachQueueEvents,
  attachWorkerEvents,
};
