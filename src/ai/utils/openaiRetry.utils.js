import env from '../../config/env.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import { asyncRetry } from '../../utils/async.utils.js';

const TIMEOUT_CODES = new Set([
  'ai_request_timeout',
  'etimedout',
  'esockettimedout',
  'und_err_connect_timeout',
  'und_err_headers_timeout',
]);
const TRANSIENT_NETWORK_CODES = new Set([
  'econnreset',
  'econnrefused',
  'eai_again',
  'enetdown',
  'enetunreach',
  'epipe',
]);
const TRANSIENT_SERVER_STATUSES = new Set([500, 502, 503, 504]);
const AUTH_CODES = new Set([
  'invalid_api_key',
  'authentication_error',
]);
const SPEND_LIMIT_CODES = new Set([
  'billing_hard_limit_reached',
  'billing_not_active',
  'insufficient_quota',
  'quota_exceeded',
  'quota_error',
  'spend_limit_reached',
]);
const SAFETY_CODES = new Set([
  'content_policy_violation',
  'model_refusal',
  'safety_refusal',
]);
const CORRECTIVE_CODES = new Set([
  'invalid_json_output',
  'invalid_schema',
  'provider_malformed_response',
]);
const TOOL_VALIDATION_CODES = new Set([
  'business_validation_error',
  'invalid_tool_arguments',
  'tool_validation_error',
  'validation_error',
]);
const CONTEXT_LIMIT_CODES = new Set([
  'context_length_exceeded',
  'context_too_large',
]);
const INVALID_REQUEST_CODES = new Set([
  'bad_request',
  'invalid_request',
  'invalid_request_error',
]);

function normalizeCode(error) {
  return String(
    error?.code
    || error?.error?.code
    || error?.type
    || error?.error?.type
    || ''
  ).trim().toLowerCase();
}

function result(category, {
  action = 'fail',
  retryable = false,
  retryKind = 'none',
  alert = false,
} = {}) {
  return {
    category,
    action,
    retryable,
    retryKind,
    alert,
  };
}

export function classifyOpenAIError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = normalizeCode(error);
  const message = String(error?.message || error?.error?.message || '').toLowerCase();

  if (
    SPEND_LIMIT_CODES.has(code)
    || /(?:billing|spend)[ _-]?(?:hard[ _-]?)?limit|insufficient quota|exceeded.+quota/.test(message)
  ) {
    return result('spend_limit', { action: 'alert', alert: true });
  }

  if (
    SAFETY_CODES.has(code)
    || Boolean(error?.refusal)
    || /content policy|safety refusal/.test(message)
  ) {
    return result('safety_refusal');
  }

  if (
    error?.name === 'AbortError'
    || code === 'abort_err'
    || code === 'request_aborted'
  ) {
    return result('cancelled');
  }

  if (error?.retryable === false) {
    return result('explicitly_non_retryable');
  }

  if (TIMEOUT_CODES.has(code) || status === 408) {
    return result('timeout', {
      action: 'retry_with_backoff',
      retryable: true,
      retryKind: 'transient',
    });
  }

  if (
    AUTH_CODES.has(code)
    || status === 401
    || status === 403
    || /authentication|invalid api key/.test(message)
  ) {
    return result('authentication');
  }

  if (CONTEXT_LIMIT_CODES.has(code)) {
    return result('context_too_large', { action: 'compact_context' });
  }

  if (CORRECTIVE_CODES.has(code)) {
    return result('invalid_schema', {
      action: 'correct_and_retry_once',
      retryable: true,
      retryKind: 'corrective',
    });
  }

  if (TOOL_VALIDATION_CODES.has(code)) {
    return result('tool_validation', { action: 'correct_input' });
  }

  if (status === 429) {
    return result('rate_limit', {
      action: 'retry_with_backoff',
      retryable: true,
      retryKind: 'transient',
    });
  }

  if (TRANSIENT_SERVER_STATUSES.has(status)) {
    return result(status === 503 ? 'service_unavailable' : 'temporary_server_error', {
      action: 'retry_with_backoff',
      retryable: true,
      retryKind: 'transient',
    });
  }

  if (TRANSIENT_NETWORK_CODES.has(code)) {
    return result('temporary_network_error', {
      action: 'retry_with_backoff',
      retryable: true,
      retryKind: 'transient',
    });
  }

  if (status >= 500 && status <= 599) {
    return result('permanent_server_error');
  }

  if (
    INVALID_REQUEST_CODES.has(code)
    || (status >= 400 && status <= 499)
  ) {
    return result('invalid_request');
  }

  return result('unknown');
}

export function isRetryableOpenAIError(error) {
  return classifyOpenAIError(error).retryable;
}

function createRequestTimeoutError(timeoutMs) {
  const error = new Error(`AI request exceeded its ${timeoutMs}ms deadline`);
  error.name = 'AIRequestTimeoutError';
  error.code = 'AI_REQUEST_TIMEOUT';
  error.status = 408;
  return error;
}

async function runWithTimeout(operation, {
  signal,
  timeoutMs,
  attempt,
} = {}) {
  if (signal?.aborted) {
    throw signal.reason || Object.assign(new Error('AI request cancelled'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    });
  }

  const timeoutController = new AbortController();
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  let timeoutId;
  let rejectOnAbort;

  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = createRequestTimeoutError(timeoutMs);
      timeoutController.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
    timeoutId.unref?.();
  });
  const abortPromise = signal
    ? new Promise((resolve, reject) => {
      rejectOnAbort = () => reject(signal.reason || Object.assign(
        new Error('AI request cancelled'),
        { name: 'AbortError', code: 'ABORT_ERR' }
      ));
      signal.addEventListener('abort', rejectOnAbort, { once: true });
    })
    : new Promise(() => {});

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation({ signal: combinedSignal, attempt })),
      timeoutPromise,
      abortPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
    if (rejectOnAbort) signal.removeEventListener('abort', rejectOnAbort);
  }
}

export async function executeOpenAIWithRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? env.aiRetry.maxRetries;
  const correctiveRetries = options.correctiveRetries ?? 1;
  let correctiveRetriesUsed = 0;

  return asyncRetry(
    (attempt) => runWithTimeout(operation, {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? env.aiRetry.requestTimeoutMs,
      attempt,
    }),
    {
      retries: maxRetries,
      baseDelayMs: options.baseDelayMs ?? env.aiRetry.baseDelayMs,
      maxDelayMs: options.maxDelayMs ?? env.aiRetry.maxDelayMs,
      jitterRatio: options.jitterRatio ?? 0.2,
      random: options.random,
      shouldRetry: (error) => {
        const classification = classifyOpenAIError(error);

        if (classification.retryKind === 'corrective') {
          if (correctiveRetriesUsed >= correctiveRetries) return false;
          correctiveRetriesUsed += 1;
          return true;
        }

        return classification.retryKind === 'transient';
      },
      onRetry: ({ error, attempt, delayMs, retries }) => {
        const classification = classifyOpenAIError(error);
        aiTelemetry.recordAiRetry({
          operation: options.operation || 'openai_request',
          category: classification.category,
          retryKind: classification.retryKind,
          attempt,
          maximumRetryCount: retries,
          delayMs,
          status: error?.status,
          code: normalizeCode(error) || undefined,
        });
        options.onRetry?.({
          error,
          classification,
          attempt,
          delayMs,
          maximumRetryCount: retries,
        });
      },
    }
  ).catch((error) => {
    const classification = classifyOpenAIError(error);

    if (classification.alert) {
      aiTelemetry.recordAiError('provider_quota_exhausted', {
        operation: options.operation || 'openai_request',
        category: classification.category,
        status: error?.status,
        code: normalizeCode(error) || undefined,
      });
    }

    throw error;
  });
}

export {
  createRequestTimeoutError,
  runWithTimeout,
};
