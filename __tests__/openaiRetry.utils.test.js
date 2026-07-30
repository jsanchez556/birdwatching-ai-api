import { jest } from '@jest/globals';
import aiTelemetry from '../src/monitoring/aiTelemetry.js';
import {
  classifyOpenAIError,
  executeOpenAIWithRetry,
} from '../src/ai/utils/openaiRetry.utils.js';

describe('selective OpenAI retry policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    [{ code: 'ETIMEDOUT' }, 'timeout', true, 'transient'],
    [{ status: 429 }, 'rate_limit', true, 'transient'],
    [{ status: 500 }, 'temporary_server_error', true, 'transient'],
    [{ status: 503 }, 'service_unavailable', true, 'transient'],
    [{ status: 501 }, 'permanent_server_error', false, 'none'],
    [{ code: 'provider_malformed_response' }, 'invalid_schema', true, 'corrective'],
    [{ status: 401 }, 'authentication', false, 'none'],
    [{ status: 400 }, 'invalid_request', false, 'none'],
    [{ code: 'invalid_request_error' }, 'invalid_request', false, 'none'],
    [{ status: 422 }, 'invalid_request', false, 'none'],
    [{ status: 429, code: 'insufficient_quota' }, 'spend_limit', false, 'none'],
    [{ code: 'tool_validation_error' }, 'tool_validation', false, 'none'],
    [{ code: 'model_refusal' }, 'safety_refusal', false, 'none'],
    [{ code: 'context_length_exceeded' }, 'context_too_large', false, 'none'],
  ])(
    'classifies %# without conflating corrective and transient retries',
    (error, category, retryable, retryKind) => {
      expect(classifyOpenAIError(error)).toMatchObject({
        category,
        retryable,
        retryKind,
      });
    }
  );

  it('retries transient failures with exponential backoff, jitter, and telemetry', async () => {
    const transientError = Object.assign(new Error('temporarily unavailable'), { status: 503 });
    const operation = jest.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue({ ok: true });
    const onRetry = jest.fn();
    const telemetrySpy = jest.spyOn(aiTelemetry, 'recordAiRetry');

    await expect(executeOpenAIWithRetry(operation, {
      operation: 'test_completion',
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      jitterRatio: 0.2,
      random: () => 0.5,
      timeoutMs: 100,
      onRetry,
    })).resolves.toEqual({ ok: true });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      delayMs: 1,
      maximumRetryCount: 3,
      classification: expect.objectContaining({
        category: 'service_unavailable',
        retryKind: 'transient',
      }),
    }));
    expect(telemetrySpy).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'test_completion',
      category: 'service_unavailable',
      attempt: 1,
      delayMs: 1,
    }));
  });

  it('enforces the maximum retry count', async () => {
    const operation = jest.fn().mockRejectedValue(
      Object.assign(new Error('server error'), { status: 500 })
    );

    await expect(executeOpenAIWithRetry(operation, {
      maxRetries: 2,
      baseDelayMs: 0,
      jitterRatio: 0,
      timeoutMs: 100,
    })).rejects.toMatchObject({ status: 500 });

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([
    { status: 401 },
    { status: 400 },
    { status: 422, code: 'validation_error' },
    { status: 429, code: 'billing_hard_limit_reached' },
    { code: 'model_refusal' },
  ])('does not retry terminal error %#', async (errorShape) => {
    const operation = jest.fn().mockRejectedValue(
      Object.assign(new Error('terminal provider failure'), errorShape)
    );

    await expect(executeOpenAIWithRetry(operation, {
      maxRetries: 5,
      baseDelayMs: 0,
      timeoutMs: 100,
    })).rejects.toMatchObject(errorShape);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('allows only one separately classified corrective schema retry', async () => {
    const operation = jest.fn().mockRejectedValue(
      Object.assign(new Error('invalid schema'), { code: 'provider_malformed_response' })
    );

    await expect(executeOpenAIWithRetry(operation, {
      maxRetries: 5,
      baseDelayMs: 0,
      timeoutMs: 100,
    })).rejects.toMatchObject({ code: 'provider_malformed_response' });

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('fails an attempt at the configured request deadline', async () => {
    const operation = jest.fn(() => new Promise(() => {}));

    await expect(executeOpenAIWithRetry(operation, {
      maxRetries: 0,
      timeoutMs: 5,
    })).rejects.toMatchObject({
      name: 'AIRequestTimeoutError',
      code: 'AI_REQUEST_TIMEOUT',
      status: 408,
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
