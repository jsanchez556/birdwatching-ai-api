import aiTelemetry from '../monitoring/aiTelemetry.js';

export const UNAVAILABLE_CAPABILITIES = Object.freeze({
  RAG_RECOMMENDATIONS: 'rag_recommendations',
  ADVANCED_MODEL: 'advanced_model',
  VOICE_SERVICE: 'voice_service',
  IMAGE_ANALYSIS: 'image_analysis',
  RESERVATION_TOOL: 'reservation_tool',
});

const CAPABILITY_ORDER = Object.freeze(Object.values(UNAVAILABLE_CAPABILITIES));
const CAPABILITY_SET = new Set(CAPABILITY_ORDER);
const CLIENT_ERROR_CODES = new Set([
  'VALIDATION_ERROR',
  'validation_error',
  'INVALID_REQUEST',
  'invalid_request',
  'INVALID_TOOL_ARGUMENTS',
  'TOUR_NOT_FOUND',
  'TOUR_AMBIGUOUS',
  'RESERVATION_CONFLICT',
  'INSUFFICIENT_AVAILABILITY',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

export function classifyCapabilityFailure(error = {}) {
  const code = String(error.code || '').trim();
  const normalizedCode = code.toLowerCase();
  const status = Number(error.status ?? error.statusCode);
  const message = String(error.message || '').toLowerCase();

  if (
    error.name === 'AbortError'
    || normalizedCode === 'abort_err'
    || normalizedCode === 'request_aborted'
  ) {
    return { recoverable: false, classification: 'cancelled' };
  }

  if (
    CLIENT_ERROR_CODES.has(code)
    || error.retryable === false
    || (status >= 400 && status < 500 && status !== 408 && status !== 429)
  ) {
    return { recoverable: false, classification: 'client_or_business_error' };
  }

  if (
    normalizedCode.includes('config')
    || normalizedCode.includes('api_key')
    || /missing.+(?:configuration|api key)|not configured/.test(message)
  ) {
    return { recoverable: true, classification: 'missing_configuration' };
  }

  if (
    normalizedCode.includes('circuit')
    || /circuit breaker|circuit is open/.test(message)
  ) {
    return { recoverable: true, classification: 'circuit_open' };
  }

  if (
    normalizedCode.includes('timeout')
    || normalizedCode === 'etimedout'
    || status === 408
    || /timed out|timeout/.test(message)
  ) {
    return { recoverable: true, classification: 'timeout' };
  }

  if (
    ['econnrefused', 'econnreset', 'eai_again', 'enetdown', 'enetunreach', 'epipe']
      .includes(normalizedCode)
  ) {
    return { recoverable: true, classification: 'connection_failure' };
  }

  if (
    normalizedCode.includes('malformed')
    || normalizedCode.includes('invalid_schema')
    || normalizedCode.includes('invalid_json')
    || /invalid provider response|empty response/.test(message)
  ) {
    return { recoverable: true, classification: 'invalid_provider_response' };
  }

  if (status === 429 || normalizedCode.includes('quota') || normalizedCode.includes('rate_limit')) {
    return { recoverable: true, classification: 'provider_rate_limit' };
  }

  if (
    status >= 500
    || normalizedCode.includes('unavailable')
    || normalizedCode === 'tool_result_indeterminate'
    || normalizedCode === 'model_routes_exhausted'
    || /\b(?:provider|service|database|postgresql|retrieval|model)\b.*\bunavailable\b/.test(message)
  ) {
    return { recoverable: true, classification: 'provider_unavailable' };
  }

  return { recoverable: false, classification: 'unexpected_failure' };
}

export function normalizeUnavailableCapabilities(capabilities = []) {
  const requested = new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .filter((capability) => CAPABILITY_SET.has(capability))
  );

  return CAPABILITY_ORDER.filter((capability) => requested.has(capability));
}

export function getDegradationMetadata(...values) {
  const unavailableCapabilities = normalizeUnavailableCapabilities(
    values.flatMap((value) => value?.unavailableCapabilities || [])
  );

  return {
    degradedMode: unavailableCapabilities.length > 0,
    unavailableCapabilities,
  };
}

export function markCapabilityUnavailable(target, capability, error, {
  telemetry = aiTelemetry,
  context = {},
  record = true,
} = {}) {
  if (!target || typeof target !== 'object' || !CAPABILITY_SET.has(capability)) {
    return getDegradationMetadata(target);
  }

  const classification = classifyCapabilityFailure(error);
  const previous = getDegradationMetadata(target);
  const next = getDegradationMetadata(previous, {
    unavailableCapabilities: [capability],
  });
  target.degradedMode = next.degradedMode;
  target.unavailableCapabilities = next.unavailableCapabilities;

  if (record && !previous.unavailableCapabilities.includes(capability)) {
    telemetry.recordAiError('capability_degraded', {
      capability,
      classification: classification.classification,
      aiTraceId: context.aiTraceId,
      traceId: context.traceId,
    });
  }

  return next;
}

export function withDegradationMetadata(payload = {}, ...values) {
  return {
    ...payload,
    ...getDegradationMetadata(...values),
  };
}
