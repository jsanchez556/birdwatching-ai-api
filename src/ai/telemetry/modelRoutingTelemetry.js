import { randomUUID } from 'crypto';
import analytics from '../../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../../analytics/events.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import observability from '../../observability/observability.service.js';
import { MODEL_REGISTRY } from '../routing/modelRegistry.js';
import { estimateCost } from './tokenUsage.js';

const ROUTING_REASON_CODES = new Set([
  'FAST_INTENT_CLASSIFICATION',
  'BALANCED_CONVERSATION',
  'GROUNDED_RAG_RESPONSE',
  'STRUCTURED_TOUR_RECOMMENDATION',
  'MULTI_STEP_RESERVATION',
  'RELIABLE_TOOL_SELECTION',
  'MULTIMODAL_BIRD_ANALYSIS',
  'INDEPENDENT_EVALUATION',
  'HIGH_COMPLEXITY_REQUEST',
  'LARGE_CONTEXT_REQUEST',
  'FREE_PLAN_ECONOMY_ROUTE',
]);

const VALIDATION_ERROR_CODES = new Set([
  'invalid_json',
  'invalid_schema',
  'empty_content',
  'missing_required_field',
  'type_mismatch',
  'provider_malformed_response',
  'unknown_validation_failure',
]);

const CONVERSION_OUTCOMES = new Set([
  'none',
  'not_applicable',
  'tour_recommended',
  'tour_selected',
  'reservation_started',
  'reservation_completed',
]);

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function boundedIdentifier(value, fallback = null) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value)
    ? value
    : fallback;
}

function normalizeTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = finiteNonNegative(
    usage.input ?? usage.inputTokens ?? usage.promptTokens
      ?? usage.input_tokens ?? usage.prompt_tokens
  );
  const output = finiteNonNegative(
    usage.output ?? usage.outputTokens ?? usage.completionTokens
      ?? usage.output_tokens ?? usage.completion_tokens
  );
  const explicitTotal = finiteNonNegative(usage.total ?? usage.totalTokens ?? usage.total_tokens);

  if (input === null && output === null && explicitTotal === null) return null;

  return {
    input: input ?? 0,
    output: output ?? 0,
    total: explicitTotal ?? ((input ?? 0) + (output ?? 0)),
  };
}

function aggregateTokens(attempts) {
  const values = attempts.map((attempt) => normalizeTokens(attempt.tokenUsage)).filter(Boolean);
  if (values.length === 0) return null;

  return values.reduce((total, value) => ({
    input: total.input + value.input,
    output: total.output + value.output,
    total: total.total + value.total,
  }), { input: 0, output: 0, total: 0 });
}

function aggregateCost(attempts) {
  if (attempts.length === 0) return null;
  let total = 0;

  for (const attempt of attempts) {
    const tokens = normalizeTokens(attempt.tokenUsage);
    if (!tokens) return null;
    const cost = estimateCost(attempt.providerModel || attempt.modelId, {
      promptTokens: tokens.input,
      completionTokens: tokens.output,
      totalTokens: tokens.total,
    });
    if (cost === null) return null;
    total += cost;
  }

  return Number(total.toFixed(6));
}

function normalizeSchemaValidation(value) {
  if (!value || typeof value !== 'object') {
    return { success: null, errorCode: null };
  }

  return {
    success: typeof value.success === 'boolean' ? value.success : null,
    errorCode: value.success === false
      ? (VALIDATION_ERROR_CODES.has(value.errorCode)
        ? value.errorCode
        : 'unknown_validation_failure')
      : null,
  };
}

function resolveSchemaValidation(attempts) {
  const applicable = attempts
    .map((attempt) => normalizeSchemaValidation(attempt.schemaValidation))
    .filter((result) => result.success !== null);
  if (applicable.length === 0) return { success: null, errorCode: null };
  return applicable.at(-1);
}

function resolveReason(modelRoute, attempts, success) {
  const routeReason = ROUTING_REASON_CODES.has(modelRoute?.reasonCode)
    ? modelRoute.reasonCode
    : 'BALANCED_CONVERSATION';
  const lastFailure = [...attempts].reverse().find((attempt) => attempt.outcome !== 'succeeded');
  if (!lastFailure) return routeReason;

  const category = boundedIdentifier(lastFailure.errorCategory, 'unknown');
  return `${success ? 'FALLBACK' : 'FAILED'}_${category.toUpperCase()}`;
}

function resolveConversionOutcome(metadata = {}) {
  const explicit = metadata.conversionOutcome;
  if (CONVERSION_OUTCOMES.has(explicit)) return explicit;
  if (metadata.reservation) return 'reservation_completed';
  if (metadata.reservationStarted) return 'reservation_started';
  if (metadata.selectedTour || metadata.selectedTourId) return 'tour_selected';
  if (metadata.tourRecommendation || metadata.recommendedTours?.length) return 'tour_recommended';
  return 'none';
}

function retryBucket(retryCount) {
  if (retryCount === 0) return 'none';
  if (retryCount === 1) return 'one';
  return 'multiple';
}

function fallbackBucket(fallbackModel) {
  return fallbackModel ? 'used' : 'none';
}

function finalAttempt(attempts) {
  return [...attempts].reverse().find((attempt) => attempt.outcome === 'succeeded')
    || attempts.at(-1)
    || null;
}

function buildModelRoutingExecution({
  executionId,
  modelRoute,
  metadata = {},
  startedAtMs,
  endedAtMs,
  success,
  userVisibleSuccess = success,
  degradedMode = false,
} = {}) {
  const attempts = Array.isArray(metadata.modelRouting?.attempts)
    ? metadata.modelRouting.attempts
    : [];
  const servingAttempt = finalAttempt(attempts);
  const initialModel = modelRoute?.primaryModel || {};
  const initialTier = MODEL_REGISTRY[initialModel.key]?.tier || modelRoute?.route || 'unknown';
  const finalTier = MODEL_REGISTRY[servingAttempt?.modelKey]?.tier || initialTier;
  const usedFallback = Boolean(servingAttempt && servingAttempt.routePosition > 0);
  const retryCount = attempts.filter((attempt) => Number(attempt.sameModelAttempt) > 1).length;
  const canonical = {
    requestedTask: modelRoute?.task || metadata.modelRouting?.task || 'general_chat',
    selectedModel: initialModel.modelId || null,
    fallbackModel: usedFallback ? (servingAttempt.providerModel || servingAttempt.modelId || null) : null,
    reason: resolveReason(modelRoute, attempts, success),
    latency: Math.max(0, Number(endedAtMs) - Number(startedAtMs)),
    tokens: aggregateTokens(attempts),
    cost: aggregateCost(attempts),
    retryCount,
    schemaValidation: resolveSchemaValidation(attempts),
    degradedMode: degradedMode === true,
    success: success === true,
  };

  return {
    executionId,
    recordedAt: new Date(endedAtMs).toISOString(),
    canonical,
    dimensions: {
      taskCategory: canonical.requestedTask,
      routingTier: initialTier,
      finalRoutingTier: finalTier,
      selectedModel: canonical.selectedModel,
      finalModel: servingAttempt?.providerModel || servingAttempt?.modelId
        || canonical.selectedModel,
      userVisibleSuccess: userVisibleSuccess === true,
      conversionOutcome: resolveConversionOutcome(metadata),
    },
    attempts,
    parentTraceId: boundedIdentifier(metadata.agentTraceId || metadata.aiTraceId),
  };
}

class ModelRoutingTelemetry {
  constructor({
    operationalTelemetry = aiTelemetry,
    analyticsService = analytics,
    observabilityService = observability,
    idFactory = randomUUID,
    clock = Date,
  } = {}) {
    this.operationalTelemetry = operationalTelemetry;
    this.analytics = analyticsService;
    this.observability = observabilityService;
    this.idFactory = idFactory;
    this.clock = clock;
  }

  start({ metadata = {} } = {}) {
    metadata.modelRouting ||= {};
    const execution = {
      id: boundedIdentifier(metadata.modelRouting.executionId) || this.idFactory(),
      startedAtMs: this.clock.now(),
      finalized: false,
    };
    metadata.modelRouting.executionId = execution.id;
    return execution;
  }

  finalize(execution, options = {}) {
    if (!execution || execution.finalized) return null;
    execution.finalized = true;
    const endedAtMs = this.clock.now();
    const record = buildModelRoutingExecution({
      executionId: execution.id,
      startedAtMs: execution.startedAtMs,
      endedAtMs,
      ...options,
    });

    try {
      this.operationalTelemetry.recordModelRoutingExecution(record);
    } catch {
      // Operational aggregation is best effort.
    }

    try {
      this.analytics.track({
        userId: options.metadata?.userId ?? options.metadata?.authUser?.id,
        anonymousId: options.metadata?.conversationId
          ? `conversation:${options.metadata.conversationId}`
          : `execution:${execution.id}`,
        event: ANALYTICS_EVENTS.MODEL_ROUTING_OUTCOME,
        idempotencyKey: execution.id,
        properties: {
          executionId: execution.id,
          taskCategory: record.dimensions.taskCategory,
          routingTier: record.dimensions.routingTier,
          degradedMode: record.canonical.degradedMode,
          userVisibleSuccess: record.dimensions.userVisibleSuccess,
          conversionOutcome: record.dimensions.conversionOutcome,
          retryBucket: retryBucket(record.canonical.retryCount),
          fallbackBucket: fallbackBucket(record.canonical.fallbackModel),
        },
      });
    } catch {
      // Product analytics is best effort.
    }

    try {
      void Promise.resolve(this.observability.recordModelRoutingExecution?.(record))
        .catch(() => {});
    } catch {
      // LangSmith export is intentionally detached from the user request.
    }

    return record;
  }
}

export {
  buildModelRoutingExecution,
  CONVERSION_OUTCOMES,
  ModelRoutingTelemetry,
  normalizeSchemaValidation,
  normalizeTokens,
  ROUTING_REASON_CODES,
  VALIDATION_ERROR_CODES,
};

export default new ModelRoutingTelemetry();
