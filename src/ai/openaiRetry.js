const RETRYABLE_OPENAI_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

export function isRetryableOpenAIError(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return false;
  }

  return RETRYABLE_OPENAI_STATUSES.has(error?.status) || error?.code === 'ETIMEDOUT';
}
