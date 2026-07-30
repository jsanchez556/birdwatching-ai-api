import { jest } from '@jest/globals';
import {
  executeModelRoute,
  isModelFallbackEligible,
  MODEL_ROUTES_EXHAUSTED_MESSAGE,
} from '../src/ai/utils/modelRouteExecution.utils.js';

const transientError = (overrides = {}) => Object.assign(
  new Error('provider details must stay internal'),
  { status: 503, ...overrides }
);

const route = (overrides = {}) => ({
  primaryModel: { key: 'primary', modelId: 'provider-primary' },
  fallbackModels: [
    { key: 'fallback-one', modelId: 'provider-fallback-one' },
    { key: 'fallback-two', modelId: 'provider-fallback-two' },
  ],
  timeoutMs: 10_000,
  maxRetries: 0,
  ...overrides,
});

describe('routed model execution', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns primary success without calling a fallback', async () => {
    const executeAttempt = jest.fn().mockResolvedValue('primary response');

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt,
    })).resolves.toBe('primary response');

    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(executeAttempt.mock.calls[0][0].model.key).toBe('primary');
  });

  it('exhausts same-model retries before the first ordered fallback', async () => {
    const executeAttempt = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue('fallback response');

    await expect(executeModelRoute({
      modelRoute: route({ maxRetries: 1 }),
      executeAttempt,
      baseDelayMs: 0,
      jitterRatio: 0,
    })).resolves.toBe('fallback response');

    expect(executeAttempt.mock.calls.map(([attempt]) => [
      attempt.model.key,
      attempt.sameModelAttempt,
    ])).toEqual([
      ['primary', 1],
      ['primary', 2],
      ['fallback-one', 1],
    ]);
  });

  it('attempts multiple fallbacks in the exact route order', async () => {
    const executeAttempt = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue('second fallback response');

    await executeModelRoute({
      modelRoute: route(),
      executeAttempt,
    });

    expect(executeAttempt.mock.calls.map(([attempt]) => attempt.model.key)).toEqual([
      'primary',
      'fallback-one',
      'fallback-two',
    ]);
  });

  it.each([
    [{ status: 401 }, 'authentication'],
    [{ status: 400 }, 'invalid_request'],
    [{ code: 'model_refusal' }, 'safety_refusal'],
    [{ code: 'context_length_exceeded' }, 'context_too_large'],
    [{ status: 429, code: 'insufficient_quota' }, 'spend_limit'],
    [{ status: 503, retryable: false }, 'explicitly_non_retryable'],
  ])('does not fall back for terminal failure %#', async (shape, category) => {
    const error = Object.assign(new Error('terminal'), shape);
    const executeAttempt = jest.fn().mockRejectedValue(error);

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt,
    })).rejects.toBe(error);

    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(isModelFallbackEligible(error)).toBe(false);
    expect(category).toEqual(expect.any(String));
  });

  it('propagates cancellation without retry or fallback', async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error('cancelled'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    });
    const executeAttempt = jest.fn().mockImplementation(() => {
      controller.abort(abortError);
      return new Promise(() => {});
    });

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt,
      signal: controller.signal,
    })).rejects.toBe(abortError);

    expect(executeAttempt).toHaveBeenCalledTimes(1);
  });

  it('uses one overall deadline and starts no later retry or fallback', async () => {
    jest.useFakeTimers();
    const initialTimerCount = jest.getTimerCount();
    const executeAttempt = jest.fn(() => new Promise(() => {}));
    const operation = executeModelRoute({
      modelRoute: route({ timeoutMs: 100, maxRetries: 3 }),
      executeAttempt,
      telemetry: { recordModelRouteAttempt: jest.fn() },
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: 'MODEL_ROUTES_EXHAUSTED',
      message: MODEL_ROUTES_EXHAUSTED_MESSAGE,
      meta: { reason: 'deadline_exceeded', retryable: true },
    });

    await jest.advanceTimersByTimeAsync(100);

    await rejection;
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(initialTimerCount);
  });

  it('charges retry delays to the same overall deadline', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const executeAttempt = jest.fn().mockRejectedValue(transientError());
    const operation = executeModelRoute({
      modelRoute: route({ timeoutMs: 100, maxRetries: 2 }),
      executeAttempt,
      baseDelayMs: 60,
      maxDelayMs: 60,
      jitterRatio: 0,
    });
    const rejection = expect(operation).rejects.toMatchObject({
      code: 'MODEL_ROUTES_EXHAUSTED',
      meta: { reason: 'deadline_exceeded' },
    });

    await jest.advanceTimersByTimeAsync(60);

    await rejection;
    expect(executeAttempt).toHaveBeenCalledTimes(2);
  });

  it('allows pre-output stream failure to fall back', async () => {
    const onChunk = jest.fn();
    const executeAttempt = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockImplementationOnce(async ({ onChunk: emit }) => {
        await emit('fallback');
        return 'fallback';
      });

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt,
      onChunk,
    })).resolves.toBe('fallback');

    expect(onChunk).toHaveBeenCalledWith('fallback');
  });

  it('never retries or falls back after client output begins', async () => {
    const onChunk = jest.fn();
    const executeAttempt = jest.fn().mockImplementation(async ({ onChunk: emit }) => {
      await emit('partial');
      throw transientError();
    });

    await expect(executeModelRoute({
      modelRoute: route({ maxRetries: 2 }),
      executeAttempt,
      onChunk,
    })).rejects.toMatchObject({ status: 503 });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(executeAttempt).toHaveBeenCalledTimes(1);
  });

  it('preserves correlation metadata and records sanitized attempt history', async () => {
    const telemetry = {
      recordModelRouteAttempt: jest.fn(),
      recordAiRetry: jest.fn(),
    };
    const metadata = {
      aiTraceId: 'ai-trace',
      agentTraceId: 'agent-trace',
      conversationId: 'conversation',
      promptVersion: 'prompt-v1',
      experiment: 'experiment',
      modelRouting: {
        primaryModelKey: 'primary',
        fallbackModelKeys: ['fallback-one', 'fallback-two'],
      },
    };
    const executeAttempt = jest.fn()
      .mockImplementationOnce(({ attemptContext }) => {
        attemptContext.providerRequestId = 'request-primary';
        attemptContext.tokenUsage = { prompt_tokens: 4, completion_tokens: 0, total_tokens: 4 };
        throw transientError();
      })
      .mockImplementationOnce(({ attemptContext }) => {
        attemptContext.providerRequestId = 'request-fallback';
        attemptContext.providerModel = 'provider-fallback-one';
        attemptContext.tokenUsage = { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 };
        return 'ok';
      });

    await executeModelRoute({
      modelRoute: route(),
      executeAttempt,
      metadata,
      telemetry,
    });

    expect(metadata).toMatchObject({
      aiTraceId: 'ai-trace',
      agentTraceId: 'agent-trace',
      conversationId: 'conversation',
      promptVersion: 'prompt-v1',
      experiment: 'experiment',
      model: 'provider-fallback-one',
      modelRouting: {
        primaryModelKey: 'primary',
        fallbackModelKeys: ['fallback-one', 'fallback-two'],
        selectedModelKey: 'fallback-one',
        selectedRoutePosition: 1,
        usedFallback: true,
      },
    });
    expect(metadata.modelRouting.attempts[0]).toMatchObject({
      modelKey: 'primary',
      outcome: 'failed',
      errorCategory: 'service_unavailable',
      providerRequestId: 'request-primary',
      tokenUsage: { total_tokens: 4 },
    });
    expect(metadata.modelRouting.attempts[1]).toMatchObject({
      modelKey: 'fallback-one',
      outcome: 'succeeded',
      providerRequestId: 'request-fallback',
      tokenUsage: { total_tokens: 8 },
    });
    expect(telemetry.recordModelRouteAttempt).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(telemetry.recordModelRouteAttempt.mock.calls))
      .not.toContain('provider details must stay internal');
  });

  it('does not fail successful generation when attempt telemetry throws', async () => {
    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt: jest.fn().mockResolvedValue('ok'),
      telemetry: {
        recordModelRouteAttempt: jest.fn(() => {
          throw new Error('telemetry unavailable');
        }),
      },
    })).resolves.toBe('ok');
  });

  it('removes the request abort listener after completion', async () => {
    const controller = new AbortController();
    const addListener = jest.spyOn(controller.signal, 'addEventListener');
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');

    await executeModelRoute({
      modelRoute: route(),
      executeAttempt: jest.fn().mockResolvedValue('ok'),
      signal: controller.signal,
    });

    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    const externalListener = addListener.mock.calls[0][1];
    expect(removeListener).toHaveBeenCalledWith('abort', externalListener);
  });

  it('returns the stable safe error after all eligible routes are exhausted', async () => {
    const executeAttempt = jest.fn().mockRejectedValue(transientError());

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt,
    })).rejects.toMatchObject({
      status: 503,
      code: 'MODEL_ROUTES_EXHAUSTED',
      expose: true,
      message: MODEL_ROUTES_EXHAUSTED_MESSAGE,
      meta: { retryable: true },
    });
  });

  it('deduplicates provider model IDs defensively', async () => {
    const executeAttempt = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue('ok');

    await executeModelRoute({
      modelRoute: route({
        fallbackModels: [
          { key: 'duplicate', modelId: 'provider-primary' },
          { key: 'independent', modelId: 'provider-independent' },
        ],
      }),
      executeAttempt,
    });

    expect(executeAttempt.mock.calls.map(([attempt]) => attempt.model.key)).toEqual([
      'primary',
      'independent',
    ]);
  });
});
