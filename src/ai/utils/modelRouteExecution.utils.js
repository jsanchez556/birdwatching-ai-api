import env from '../../config/env.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import HttpError from '../../utils/httpError.js';
import {
  classifyOpenAIError,
  createRequestTimeoutError,
} from './openaiRetry.utils.js';

const MODEL_ROUTES_EXHAUSTED_MESSAGE =
  'I’m having trouble completing that request right now. Please try again in a moment.';

function createAbortError(reason) {
  if (reason instanceof Error) return reason;
  return Object.assign(new Error('AI request cancelled'), {
    name: 'AbortError',
    code: 'ABORT_ERR',
  });
}

function createRoutesExhaustedError({ deadlineExpired = false } = {}) {
  return new HttpError(503, MODEL_ROUTES_EXHAUSTED_MESSAGE, {
    code: 'MODEL_ROUTES_EXHAUSTED',
    expose: true,
    meta: {
      retryable: true,
      ...(deadlineExpired ? { reason: 'deadline_exceeded' } : {}),
    },
  });
}

function calculateRetryDelay(attempt, {
  baseDelayMs = env.aiRetry.baseDelayMs,
  maxDelayMs = env.aiRetry.maxDelayMs,
  jitterRatio = 0.2,
  random = Math.random,
} = {}) {
  const exponentialDelayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitterWindowMs = exponentialDelayMs * Math.max(0, jitterRatio);
  return Math.max(
    0,
    Math.round(exponentialDelayMs - jitterWindowMs + (2 * jitterWindowMs * random()))
  );
}

function waitWithSignal(delayMs, signal) {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    timeoutId.unref?.();

    function onAbort() {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError(signal.reason));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function runWithSignal(operation, signal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }

  return new Promise((resolve, reject) => {
    function onAbort() {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError(signal.reason));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
  });
}

function safeRecordAttempt(record, metadata, telemetry) {
  metadata.modelRouting ||= {};
  metadata.modelRouting.attempts ||= [];
  metadata.modelRouting.attempts.push(record);

  try {
    telemetry.recordModelRouteAttempt(record);
  } catch {
    // Operational telemetry must never change the user-visible request outcome.
  }
}

function buildModelChain(modelRoute) {
  const seen = new Set();
  return [modelRoute.primaryModel, ...(modelRoute.fallbackModels || [])]
    .filter((model) => {
      if (!model?.modelId || seen.has(model.modelId)) return false;
      seen.add(model.modelId);
      return true;
    });
}

function safeOperationalCode(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(normalized) ? normalized : undefined;
}

export function isModelFallbackEligible(error, {
  clientOutputStarted = false,
} = {}) {
  if (clientOutputStarted || error?.retryable === false) return false;
  return classifyOpenAIError(error).retryable === true;
}

export async function executeModelRoute({
  modelRoute,
  executeAttempt,
  onChunk = () => {},
  signal,
  metadata = {},
  telemetry = aiTelemetry,
  now = () => Date.now(),
  baseDelayMs,
  maxDelayMs,
  jitterRatio,
  random,
} = {}) {
  const models = buildModelChain(modelRoute || {});

  if (!modelRoute?.primaryModel || models.length === 0) {
    throw createRoutesExhaustedError();
  }

  const timeoutMs = Math.max(0, Number(modelRoute.timeoutMs) || 0);
  const deadlineAt = now() + timeoutMs;
  const deadlineController = new AbortController();
  const operationController = new AbortController();
  let deadlineExpired = false;
  let externalAbortListener;

  const deadlineError = createRequestTimeoutError(timeoutMs);
  const deadlineTimer = setTimeout(() => {
    deadlineExpired = true;
    deadlineController.abort(deadlineError);
    operationController.abort(deadlineError);
  }, timeoutMs);
  deadlineTimer.unref?.();

  if (signal) {
    externalAbortListener = () => operationController.abort(createAbortError(signal.reason));
    signal.addEventListener('abort', externalAbortListener, { once: true });
    if (signal.aborted) externalAbortListener();
  }

  const combinedSignal = AbortSignal.any([
    operationController.signal,
    deadlineController.signal,
  ]);

  try {
    for (const [routePosition, model] of models.entries()) {
      let correctiveRetriesUsed = 0;
      const maximumRetries = Math.max(0, Number(modelRoute.maxRetries) || 0);

      for (let sameModelAttempt = 0; sameModelAttempt <= maximumRetries; sameModelAttempt += 1) {
        const remainingDeadlineMs = Math.max(0, deadlineAt - now());

        if (remainingDeadlineMs <= 0 || deadlineExpired) {
          throw createRoutesExhaustedError({ deadlineExpired: true });
        }

        const startedAtMs = now();
        let clientOutputStarted = false;
        const attemptContext = {};
        const attemptRole = routePosition === 0 ? 'primary' : 'fallback';

        try {
          const value = await runWithSignal(() => executeAttempt({
            model,
            signal: combinedSignal,
            timeoutMs: remainingDeadlineMs,
            routePosition,
            attemptRole,
            sameModelAttempt: sameModelAttempt + 1,
            attemptContext,
            onChunk: async (chunk) => {
              await onChunk(chunk);
              clientOutputStarted = true;
            },
          }), combinedSignal);
          const endedAtMs = now();
          const record = {
            modelKey: model.key,
            modelId: model.modelId,
            attemptRole,
            routePosition,
            sameModelAttempt: sameModelAttempt + 1,
            startedAt: new Date(startedAtMs).toISOString(),
            endedAt: new Date(endedAtMs).toISOString(),
            durationMs: Math.max(0, endedAtMs - startedAtMs),
            outcome: 'succeeded',
            fallbackEligible: false,
            clientOutputStarted,
            providerRequestId: attemptContext.providerRequestId,
            remainingDeadlineMs,
            tokenUsage: attemptContext.tokenUsage,
          };
          safeRecordAttempt(record, metadata, telemetry);
          metadata.model = attemptContext.providerModel || model.modelId;
          metadata.modelRouting.selectedModelKey = model.key;
          metadata.modelRouting.selectedRoutePosition = routePosition;
          metadata.modelRouting.usedFallback = routePosition > 0;
          return value;
        } catch (error) {
          const endedAtMs = now();
          const classification = classifyOpenAIError(error);
          const wasDeadline = deadlineExpired || endedAtMs >= deadlineAt;
          const fallbackEligible = !wasDeadline && isModelFallbackEligible(error, {
            clientOutputStarted,
          });
          safeRecordAttempt({
            modelKey: model.key,
            modelId: model.modelId,
            attemptRole,
            routePosition,
            sameModelAttempt: sameModelAttempt + 1,
            startedAt: new Date(startedAtMs).toISOString(),
            endedAt: new Date(endedAtMs).toISOString(),
            durationMs: Math.max(0, endedAtMs - startedAtMs),
            outcome: wasDeadline
              ? 'deadline_exceeded'
              : (classification.category === 'cancelled' ? 'cancelled' : 'failed'),
            errorCategory: classification.category,
            errorCode: safeOperationalCode(error?.code),
            fallbackEligible,
            clientOutputStarted,
            providerRequestId: attemptContext.providerRequestId || error?.providerRequestId,
            remainingDeadlineMs,
            tokenUsage: attemptContext.tokenUsage,
          }, metadata, telemetry);

          if (wasDeadline) {
            throw createRoutesExhaustedError({ deadlineExpired: true });
          }
          if (classification.category === 'cancelled' || signal?.aborted) {
            throw error;
          }
          if (!fallbackEligible) {
            throw error;
          }

          const correctiveRetry = classification.retryKind === 'corrective';
          const retryAvailable = sameModelAttempt < maximumRetries
            && (!correctiveRetry || correctiveRetriesUsed < 1);

          if (retryAvailable) {
            if (correctiveRetry) correctiveRetriesUsed += 1;
            const delayMs = calculateRetryDelay(sameModelAttempt, {
              baseDelayMs,
              maxDelayMs,
              jitterRatio,
              random,
            });
            const remainingBeforeDelay = Math.max(0, deadlineAt - now());

            if (delayMs >= remainingBeforeDelay) {
              throw createRoutesExhaustedError({ deadlineExpired: true });
            }

            try {
              telemetry.recordAiRetry({
                operation: 'routed_chat_completion_stream',
                category: classification.category,
                retryKind: classification.retryKind,
                attempt: sameModelAttempt + 1,
                maximumRetryCount: maximumRetries,
                delayMs,
                modelKey: model.key,
                routePosition,
              });
            } catch {
              // Retry telemetry is best effort.
            }
            await waitWithSignal(delayMs, combinedSignal);
            continue;
          }

          break;
        }
      }
    }

    throw createRoutesExhaustedError();
  } catch (error) {
    if (deadlineExpired || now() >= deadlineAt) {
      throw createRoutesExhaustedError({ deadlineExpired: true });
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    if (externalAbortListener) signal.removeEventListener('abort', externalAbortListener);
    if (!operationController.signal.aborted) operationController.abort();
  }
}

export {
  MODEL_ROUTES_EXHAUSTED_MESSAGE,
  calculateRetryDelay,
  createRoutesExhaustedError,
  safeOperationalCode,
};
