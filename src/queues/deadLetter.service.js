const SENSITIVE_KEYS = new Set([
  'authorization',
  'body',
  'buffer',
  'content',
  'description',
  'document',
  'documents',
  'imageUpload',
  'imageUrl',
  'password',
  'prompt',
  'response',
  'secret',
  'sourcePayload',
  'text',
  'token',
]);

function sanitizeError(error = {}) {
  return {
    name: error.name || 'Error',
    code: error.code,
    message: error.message || 'Background job failed',
  };
}

function sanitizeMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .filter(([, entryValue]) => ['boolean', 'number', 'string'].includes(typeof entryValue))
      .map(([key, entryValue]) => [key, String(entryValue).slice(0, 120)])
  );
}

function buildDeadLetterPayload({
  queueName,
  job,
  error,
  failedAt = new Date(),
} = {}) {
  const attemptsMade = Number(job?.attemptsMade || 0);
  const configuredAttempts = Number(job?.opts?.attempts || attemptsMade);

  return {
    originalQueueName: queueName,
    jobName: job?.name,
    jobId: job?.id,
    attemptsMade,
    configuredAttempts,
    error: sanitizeError(error),
    failedAt: failedAt.toISOString(),
    metadata: sanitizeMetadata({
      jobId: job?.data?.jobId,
      documentId: job?.data?.documentId,
      userId: job?.data?.userId,
      ...job?.data?.metadata,
    }),
  };
}

class DeadLetterService {
  constructor({
    queueFactory,
  } = {}) {
    this.queueFactory = queueFactory;
  }

  async enqueue(payload) {
    const queue = this.queueFactory();

    return queue.add('dead-letter', payload, {
      jobId: `dlq-${payload.originalQueueName}-${payload.jobId}-${payload.attemptsMade}`,
      attempts: 1,
    });
  }
}

export {
  DeadLetterService,
  buildDeadLetterPayload,
  sanitizeError,
  sanitizeMetadata,
};
