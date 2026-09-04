import aiTelemetry from '../../monitoring/aiTelemetry.js';
import { UNAVAILABLE_CAPABILITIES } from '../../utils/degradation.utils.js';

const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|apiKey|authorization|databaseUrl|customerEmail|customerName|email|phone)/i;
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'RATE_LIMITED',
  'TIMEOUT', 'TOOL_EXECUTION_FAILED', 'TRANSIENT_ERROR', 'TEMPORARY_ERROR',
  'SERVICE_UNAVAILABLE', 'DATABASE_UNAVAILABLE',
]);
const PERMANENT_FAILURE_PATTERN = /^(INVALID_|VALIDATION_|MISSING_|UNKNOWN_TOOL|TOUR_NOT_FOUND|TOUR_SELECTION_|TOUR_SELECTION_MISMATCH|TRANSFER_LOCATION_REQUIRED)/;

export function sanitizeToolTraceValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeToolTraceValue(item, depth + 1));
  }
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, entryValue]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeToolTraceValue(entryValue, depth + 1),
  ]));
}

export function normalizeRetryOptions(options = {}) {
  const toNonNegativeNumber = (value, fallback) => {
    const numberValue = Number(value ?? fallback);
    return Number.isFinite(numberValue) ? Math.max(0, numberValue) : fallback;
  };
  return {
    retries: toNonNegativeNumber(options.retries ?? options.maxRetries, 2),
    baseDelayMs: toNonNegativeNumber(options.baseDelayMs ?? options.delayMs, 50),
  };
}

function isRetryableCode(code) {
  return code && RETRYABLE_ERROR_CODES.has(code);
}

export function isRetryableToolResult(result = {}) {
  if (result?.success !== false || result.retryable === false) return false;
  if (result.retryable === true) return true;
  if (PERMANENT_FAILURE_PATTERN.test(result.code || '')) return false;
  return isRetryableCode(result.code);
}

export function isRetryableToolError(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.retryable === false) return false;
  return error?.retryable === true
    || RETRYABLE_STATUSES.has(error?.status)
    || isRetryableCode(error?.code)
    || !error?.code;
}

export function summarizeToolError(error) {
  return sanitizeToolTraceValue({
    name: error?.name,
    code: error?.code,
    status: error?.status,
    message: error?.message,
  });
}

export function monitorToolFailure(toolName, metadata = {}, failure = {}, details = {}) {
  const timeout = failure.code === 'ETIMEDOUT'
    || failure.code === 'TIMEOUT'
    || failure.code === 'LOCK_TIMEOUT'
    || failure.name === 'TimeoutError'
    || /timeout|timed out/i.test(failure.message || '');
  aiTelemetry.recordAiError(timeout ? 'tool_timeout' : 'tool_failed', {
    toolName,
    ...(toolName === 'createReservation'
      ? { capability: UNAVAILABLE_CAPABILITIES.RESERVATION_TOOL }
      : {}),
    conversationId: metadata.conversationId,
    userId: metadata.userId,
    aiTraceId: metadata.aiTraceId,
    role: metadata.role,
    planStatus: metadata.agentPlan?.status,
    failure: sanitizeToolTraceValue(failure),
    ...details,
  });
}
