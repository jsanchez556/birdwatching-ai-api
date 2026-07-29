import observabilityService from '../observability/observability.service.js';

function summarizeJob(job = {}) {
  if (!job || Object.keys(job).length === 0) {
    return {};
  }

  const attemptsMade = Number(job?.attemptsMade || 0);
  const configuredAttempts = Number(job?.opts?.attempts || 0);

  return {
    jobId: job?.id,
    jobName: job?.name,
    attempt: attemptsMade + 1,
    attemptsMade,
    configuredAttempts,
  };
}

function buildQueueMetadata({
  queueName,
  jobType,
  job,
  jobId,
  workerName,
  extra = {},
} = {}) {
  return {
    queueName,
    workerName,
    jobType: jobType || job?.name,
    jobId: jobId || job?.id,
    ...summarizeJob(job),
    ...extra,
  };
}

function sanitizeBackgroundJobError(error = {}) {
  const safeError = new Error(
    error.name === 'UnrecoverableError'
      ? error.message || 'Background job validation failed'
      : 'Background job failed'
  );

  safeError.name = error.name || 'Error';
  safeError.code = error.code;
  safeError.status = error.status;

  return safeError;
}

class BackgroundJobTracer {
  constructor({
    service = observabilityService,
  } = {}) {
    this.service = service;
  }

  traceOperation(name, metadata = {}, operation, options = {}) {
    const trace = this.service.startTrace({
      type: 'background_job',
      name,
      metadata,
      parentTraceId: metadata.parentTraceId,
    });

    return Promise.resolve()
      .then(() => this.service.createLangSmithRun?.(trace))
      .then(() => operation(trace))
      .then(async (result) => {
        const details = typeof options.outputMetadata === 'function'
          ? options.outputMetadata(result)
          : options.outputMetadata;

        trace.end(details || {});
        await this.service.completeLangSmithRun?.(trace, details || {});

        return result;
      })
      .catch(async (error) => {
        const safeError = sanitizeBackgroundJobError(error);

        await this.service.failLangSmithRun?.(trace, safeError);
        trace.error(safeError);
        throw error;
      });
  }

  recordEvent(name, metadata = {}, details = {}) {
    const trace = this.service.startTrace({
      type: 'background_job',
      name,
      metadata,
      parentTraceId: metadata.parentTraceId,
    });

    const run = Promise.resolve()
      .then(() => this.service.createLangSmithRun?.(trace))
      .then(() => {
        trace.end(details);
        return this.service.completeLangSmithRun?.(trace, details);
      })
      .catch((error) => {
        trace.error(error);
      });

    return run;
  }
}

const backgroundJobTracer = new BackgroundJobTracer();

export {
  BackgroundJobTracer,
  buildQueueMetadata,
  sanitizeBackgroundJobError,
  summarizeJob,
};
export default backgroundJobTracer;
