import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import {
  OPERATIONAL_ERROR_TYPE_SET,
  mapAiEventType,
  mapTraceFailureType,
} from './operationalErrors.js';

const SENSITIVE_KEY_PATTERN = /(password|secret|token|apiKey|authorization|databaseUrl|customerEmail|customerName|email|phone|content|prompt|message|input|output|^answer$|answerText|assistantAnswer|finalAnswer|text|args|arguments|customer)/i;
const SAFE_TELEMETRY_KEY_PATTERN = /^(promptVersion|promptVersions|promptTokens|completionTokens|totalTokens|inputTokens|outputTokens|requestTokens|prompt_tokens|completion_tokens|total_tokens|input_tokens|output_tokens|tokenUsage)$/;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 24;
const MAX_STRING_LENGTH = 240;
const MAX_OPERATIONAL_ERRORS = 250;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;

function safeIdentifier(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const normalized = String(value);
  return normalized.length > 0
    && normalized.length <= 160
    && SAFE_IDENTIFIER_PATTERN.test(normalized)
    ? normalized
    : null;
}

function firstSafeIdentifier(...values) {
  for (const value of values) {
    const normalized = safeIdentifier(value);
    if (normalized) return normalized;
  }
  return null;
}

function sanitizeTelemetryValue(value, depth = 0) {
  if (value === null || value === undefined) return value;

  if (typeof value !== 'object') {
    if (typeof value === 'string') {
      return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
    }

    return value;
  }

  if (depth >= 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeTelemetryValue(item, depth + 1));
  }

  return Object.fromEntries(Object.entries(value)
    .slice(0, MAX_OBJECT_KEYS)
    .map(([key, entryValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) && !SAFE_TELEMETRY_KEY_PATTERN.test(key)
        ? '[redacted]'
        : sanitizeTelemetryValue(entryValue, depth + 1),
    ]));
}

function normalizeTokenUsage(usage = {}) {
  const promptTokens = Number(usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completionTokens = Number(usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.totalTokens ?? usage.total_tokens ?? promptTokens + completionTokens);

  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

class AiTelemetry {
  constructor({
    log = logger,
    clock = Date,
    idFactory = randomUUID,
    maxOperationalErrors = MAX_OPERATIONAL_ERRORS,
  } = {}) {
    this.logger = log;
    this.clock = clock;
    this.idFactory = idFactory;
    this.maxOperationalErrors = Math.max(1, Number(maxOperationalErrors) || MAX_OPERATIONAL_ERRORS);
    this.reset();
  }

  reset() {
    this.counters = {
      tracesStarted: 0,
      tracesCompleted: 0,
      tracesFailed: 0,
      errors: 0,
      aiErrors: 0,
      aiEvaluations: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    this.latencies = [];
    this.operationalErrors = [];
  }

  recordOperationalError({
    type,
    userId,
    traceId,
    sourceEvent,
    sourceId,
    timestamp,
  } = {}) {
    if (!OPERATIONAL_ERROR_TYPE_SET.has(type)) return null;

    const occurredAt = timestamp ? new Date(timestamp) : new Date(this.clock.now());
    const record = {
      id: firstSafeIdentifier(sourceId) || `telemetry-${this.idFactory()}`,
      timestamp: Number.isNaN(occurredAt.getTime())
        ? new Date(this.clock.now()).toISOString()
        : occurredAt.toISOString(),
      type,
      userId: firstSafeIdentifier(userId),
      traceId: firstSafeIdentifier(traceId),
      sourceEvent: firstSafeIdentifier(sourceEvent),
    };

    this.operationalErrors.unshift(record);
    this.operationalErrors.length = Math.min(
      this.operationalErrors.length,
      this.maxOperationalErrors
    );
    return { ...record };
  }

  recordTraceStarted(trace = {}) {
    this.counters.tracesStarted += 1;
    this.logger.info('AI trace started', {
      event: 'ai_trace_started',
      traceId: trace.id,
      parentTraceId: trace.parentTraceId,
      traceType: trace.type,
      name: trace.name,
      metadata: sanitizeTelemetryValue(trace.metadata || {}),
    });
  }

  recordLatency(trace = {}, durationMs = 0, metadata = {}) {
    const normalizedDuration = Number(durationMs);
    const latency = {
      traceId: trace.id,
      traceType: trace.type,
      name: trace.name,
      durationMs: Number.isFinite(normalizedDuration) ? normalizedDuration : 0,
      metadata: sanitizeTelemetryValue(metadata),
    };

    this.latencies.push(latency);
    this.counters.tracesCompleted += 1;
    this.logger.info('AI trace completed', {
      event: 'ai_trace_completed',
      ...latency,
    });
  }

  recordTokenUsage(trace = {}, usage = {}) {
    const tokenUsage = normalizeTokenUsage(usage);

    this.counters.promptTokens += tokenUsage.promptTokens;
    this.counters.completionTokens += tokenUsage.completionTokens;
    this.counters.totalTokens += tokenUsage.totalTokens;

    this.logger.info('AI token usage recorded', {
      event: 'ai_token_usage',
      traceId: trace.id,
      traceType: trace.type,
      name: trace.name,
      ...tokenUsage,
    });
  }

  recordError(trace = {}, error, metadata = {}) {
    this.counters.errors += 1;
    this.counters.tracesFailed += 1;
    this.logger.warn('AI trace failed', {
      event: 'ai_trace_failed',
      traceId: trace.id,
      traceType: trace.type,
      name: trace.name,
      error: sanitizeTelemetryValue({
        name: error?.name,
        code: error?.code,
        status: error?.status,
        message: error?.message,
      }),
      metadata: sanitizeTelemetryValue(metadata),
    });

    const type = mapTraceFailureType(trace, error);
    if (type) {
      this.recordOperationalError({
        type,
        userId: metadata.userId ?? trace.metadata?.userId,
        traceId: trace.id,
        sourceEvent: 'ai_trace_failed',
      });
    }
  }

  recordAiError(event, details = {}) {
    this.counters.aiErrors += 1;
    this.logger.warn('AI error monitored', {
      event,
      ...sanitizeTelemetryValue(details),
    });

    const type = mapAiEventType(event);
    if (type) {
      this.recordOperationalError({
        type,
        userId: details.userId,
        traceId: details.aiTraceId ?? details.traceId,
        sourceEvent: event,
      });
    }
  }

  recordAiEvaluation(event, details = {}) {
    this.counters.aiEvaluations += 1;
    this.logger.info('AI evaluation tracked', {
      event,
      ...sanitizeTelemetryValue(details),
    });
  }

  getSnapshot() {
    return {
      counters: { ...this.counters },
      latencies: [...this.latencies],
    };
  }

  getOperationalErrors() {
    return this.operationalErrors.map((entry) => ({ ...entry }));
  }
}

export {
  AiTelemetry,
  MAX_OPERATIONAL_ERRORS,
  normalizeTokenUsage,
  safeIdentifier,
  sanitizeTelemetryValue,
};
export default new AiTelemetry();
