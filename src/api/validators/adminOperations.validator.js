const JOB_ID_PATTERN = /^[A-Za-z0-9:_-]{1,200}$/;
const REASON_CODES = new Set(['abuse', 'spam', 'security', 'policy_violation']);
const MAX_DISABLE_MINUTES = 24 * 60;

function unknownFields(value, allowed) {
  return Object.keys(value || {}).filter((field) => !allowed.has(field));
}

export function validateRetryJob(req) {
  const errors = [];
  const jobId = req.params?.jobId;

  if (typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
    errors.push('jobId must be a valid job identifier');
  }
  if (unknownFields(req.body, new Set()).length) {
    errors.push('Retry job payload does not accept fields');
  }

  return {
    message: 'Invalid retry job request',
    errors,
    value: { jobId },
  };
}

export function validateSuspendUser(req) {
  const errors = [];
  const userId = Number(req.params?.userId);
  const reasonCode = req.body?.reasonCode || 'abuse';

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    errors.push('userId must be a positive integer');
  }
  if (!REASON_CODES.has(reasonCode)) {
    errors.push(`reasonCode must be one of: ${[...REASON_CODES].join(', ')}`);
  }
  if (unknownFields(req.body, new Set(['reasonCode'])).length) {
    errors.push('Suspend user payload contains unknown fields');
  }

  return {
    message: 'Invalid suspend user request',
    errors,
    value: { userId, reasonCode },
  };
}

export function validateDisableAiFeature(req) {
  const errors = [];
  const feature = req.params?.feature;
  const durationMinutes = Number(req.body?.durationMinutes);

  if (typeof feature !== 'string' || !/^[a-z][a-z0-9_]{1,80}$/.test(feature)) {
    errors.push('feature must be a valid feature identifier');
  }
  if (
    !Number.isSafeInteger(durationMinutes)
    || durationMinutes < 1
    || durationMinutes > MAX_DISABLE_MINUTES
  ) {
    errors.push(`durationMinutes must be an integer from 1 to ${MAX_DISABLE_MINUTES}`);
  }
  if (unknownFields(req.body, new Set(['durationMinutes'])).length) {
    errors.push('Disable feature payload contains unknown fields');
  }

  return {
    message: 'Invalid disable AI feature request',
    errors,
    value: { feature, durationMinutes },
  };
}

export function validateEnableAiFeature(req) {
  const errors = [];
  const feature = req.params?.feature;
  if (typeof feature !== 'string' || !/^[a-z][a-z0-9_]{1,80}$/.test(feature)) {
    errors.push('feature must be a valid feature identifier');
  }
  if (unknownFields(req.body, new Set()).length) {
    errors.push('Enable feature payload does not accept fields');
  }
  return {
    message: 'Invalid enable AI feature request',
    errors,
    value: { feature },
  };
}

export function validateUnsuspendUser(req) {
  const errors = [];
  const userId = Number(req.params?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    errors.push('userId must be a positive integer');
  }
  if (unknownFields(req.body, new Set()).length) {
    errors.push('Reactivate user payload does not accept fields');
  }
  return {
    message: 'Invalid reactivate user request',
    errors,
    value: { userId },
  };
}

export { MAX_DISABLE_MINUTES, REASON_CODES };
