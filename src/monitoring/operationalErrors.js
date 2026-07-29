const OPERATIONAL_ERROR_TYPES = Object.freeze([
  'LLM_ERROR',
  'TOOL_ERROR',
  'RETRIEVAL_ERROR',
  'INVALID_OUTPUT',
  'QUEUE_FAILURE',
  'RATE_LIMIT',
  'PAYMENT_FAILURE',
]);

const OPERATIONAL_ERROR_TYPE_SET = new Set(OPERATIONAL_ERROR_TYPES);

const AI_EVENT_TYPES = Object.freeze({
  tool_timeout: 'TOOL_ERROR',
  tool_failed: 'TOOL_ERROR',
  retrieval_failed: 'RETRIEVAL_ERROR',
  invalid_json_output: 'INVALID_OUTPUT',
  invalid_output: 'INVALID_OUTPUT',
  hallucination_event: 'INVALID_OUTPUT',
  rate_limit: 'RATE_LIMIT',
});

const TRACE_TYPES = Object.freeze({
  llm: 'LLM_ERROR',
  tool_execution: 'TOOL_ERROR',
  rag_retrieval: 'RETRIEVAL_ERROR',
  rag_pipeline: 'RETRIEVAL_ERROR',
  background_job: 'QUEUE_FAILURE',
});

function isRateLimitFailure(error = {}) {
  const code = String(error?.code || '');
  return Number(error?.status) === 429
    || /(?:^|_)RATE_LIMIT(?:ED)?(?:_|$)/i.test(code)
    || code === 'TOO_MANY_REQUESTS';
}

function isInvalidOutputFailure(error = {}) {
  const code = String(error?.code || '');
  return [
    'INVALID_OUTPUT',
    'INVALID_JSON_OUTPUT',
    'PROVIDER_MALFORMED_RESPONSE',
  ].includes(code.toUpperCase());
}

function mapAiEventType(event) {
  return AI_EVENT_TYPES[event] || null;
}

function mapTraceFailureType(trace = {}, error = {}) {
  if (isRateLimitFailure(error)) return 'RATE_LIMIT';
  if (isInvalidOutputFailure(error)) return 'INVALID_OUTPUT';
  return TRACE_TYPES[trace.type] || null;
}

export {
  AI_EVENT_TYPES,
  OPERATIONAL_ERROR_TYPES,
  OPERATIONAL_ERROR_TYPE_SET,
  TRACE_TYPES,
  isInvalidOutputFailure,
  isRateLimitFailure,
  mapAiEventType,
  mapTraceFailureType,
};
