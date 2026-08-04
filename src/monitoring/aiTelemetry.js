import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import {
  OPERATIONAL_ERROR_TYPE_SET,
  mapAiEventType,
  mapTraceFailureType,
} from './operationalErrors.js';

const SENSITIVE_KEY_PATTERN = /(password|secret|token|apiKey|authorization|databaseUrl|customerEmail|customerName|email|phone|content|prompt|message|input|output|^answer$|answerText|assistantAnswer|finalAnswer|text|args|arguments|customer)/i;
const SAFE_TELEMETRY_KEY_PATTERN = /^(promptVersion|promptVersions|promptTokens|completionTokens|totalTokens|inputTokens|inputTokenSource|outputTokens|requestTokens|prompt_tokens|completion_tokens|total_tokens|input_tokens|output_tokens|tokenUsage|tokens|tokensByContextType|contextTelemetry|clientOutputStarted|input|output|total)$/;
const MAX_ARRAY_ITEMS = 24;
const MAX_OBJECT_KEYS = 24;
const MAX_STRING_LENGTH = 240;
const MAX_OPERATIONAL_ERRORS = 250;
const MAX_MODEL_ROUTING_EXECUTIONS = 2_000;
const MAX_CONTEXT_ENGINEERING_RECORDS = 2_000;
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
    .map(([key, entryValue]) => {
      const numericTokenField = /^(input|output|total)$/.test(key);
      const safeTelemetryField = (SAFE_TELEMETRY_KEY_PATTERN.test(key)
        || key === 'originalContentHash'
        || key === 'contextProvenance'
        || key === 'contextItemId'
        || key === 'winningContextItemId'
        || key === 'supersededContextItemIds'
        || key === 'originalEstimatedTokens'
        || key === 'finalEstimatedTokens')
        && (!numericTokenField || typeof entryValue === 'number');
      return [
        key,
        SENSITIVE_KEY_PATTERN.test(key) && !safeTelemetryField
          ? '[redacted]'
          : key === 'contextProvenance' && Array.isArray(entryValue)
            ? entryValue.map((item) => sanitizeTelemetryValue(item, depth + 1))
            : sanitizeTelemetryValue(entryValue, depth + 1),
      ];
    }));
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

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? Math.floor(normalized) : 0;
}

function nonNegativeIntegerOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeContextTokenCounts(value = {}) {
  return Object.fromEntries([
    'instructions',
    'conversation',
    'memories',
    'rag',
    'toolResults',
    'applicationState',
  ].map((type) => [type, nonNegativeInteger(value?.[type])]));
}

function classifyContextFailure(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('scope') || code.includes('authoriz')) return 'scope';
  if (code.includes('fresh') || code.includes('expired') || code.includes('stale')) return 'freshness';
  if (code.includes('compact') || code.includes('summary')) return 'compaction';
  if (code.includes('budget') || code.includes('token')) return 'budgeting';
  if (code.includes('valid') || code.includes('input') || code.includes('schema')) return 'validation';
  return 'context_assembly';
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
      aiRetries: 0,
      modelRouteAttempts: 0,
      modelRoutingExecutions: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    this.latencies = [];
    this.operationalErrors = [];
    this.modelRoutingExecutions = [];
    this.contextEngineeringRecords = [];
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
    if (trace.type === 'context_assembly') {
      this.recordContextAssembly(trace, metadata);
    }
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
    if (trace.type === 'llm' && trace.metadata?.contextTelemetry?.stage === 'generation') {
      this.recordContextActualUsage(trace, tokenUsage);
    }
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
    if (trace.type === 'context_assembly') {
      this.recordContextAssembly(trace, metadata, {
        failureCategory: classifyContextFailure(error),
      });
    }
  }

  recordContextAssembly(trace = {}, details = {}, { failureCategory = null } = {}) {
    const metrics = details && typeof details === 'object' ? details : {};
    const stage = ['planning', 'generation'].includes(metrics.stage)
      ? metrics.stage
      : ['planning', 'generation'].includes(trace.metadata?.stage)
        ? trace.metadata.stage
        : 'unknown';
    const timestamp = new Date(this.clock.now()).toISOString();
    const record = sanitizeTelemetryValue({
      recordedAt: timestamp,
      requestCorrelationId: firstSafeIdentifier(
        trace.metadata?.requestCorrelationId,
        trace.parentTraceId,
        trace.id
      ),
      traceId: firstSafeIdentifier(trace.id),
      stage,
      model: firstSafeIdentifier(metrics.model, trace.metadata?.model),
      task: firstSafeIdentifier(metrics.task, trace.metadata?.task),
      memoryEligible: trace.metadata?.memoryEligible === true,
      ragEligible: trace.metadata?.ragEligible === true,
      failureCategory: failureCategory || null,
      candidateContextItems: nonNegativeInteger(metrics.candidateContextItems),
      selectedContextItems: nonNegativeInteger(metrics.selectedContextItems),
      discardedContextItems: nonNegativeInteger(metrics.discardedContextItems),
      inputTokens: nonNegativeInteger(metrics.inputTokens),
      inputTokenSource: metrics.inputTokenSource === 'actual' ? 'actual' : 'estimated',
      tokensByContextType: normalizeContextTokenCounts(metrics.tokensByContextType),
      compactionTriggered: metrics.compactionTriggered === true,
      summaryVersion: nonNegativeIntegerOrNull(metrics.summaryVersion),
      memoriesRetrieved: nonNegativeInteger(metrics.memoriesRetrieved),
      ragChunksSelected: nonNegativeInteger(metrics.ragChunksSelected),
      toolResultsCompacted: nonNegativeInteger(metrics.toolResultsCompacted),
      contextBuildLatency: nonNegativeInteger(metrics.contextBuildLatency),
    });
    this.contextEngineeringRecords.unshift(record);
    this.contextEngineeringRecords.length = Math.min(
      this.contextEngineeringRecords.length,
      MAX_CONTEXT_ENGINEERING_RECORDS
    );
    return structuredClone(record);
  }

  recordContextActualUsage(trace = {}, usage = {}) {
    const correlationId = firstSafeIdentifier(
      trace.metadata?.requestCorrelationId,
      trace.parentTraceId
    );
    if (!correlationId) return null;
    const record = this.contextEngineeringRecords.find((entry) => (
      entry.requestCorrelationId === correlationId && entry.stage === 'generation'
    ));
    if (!record) return null;
    record.inputTokens = nonNegativeInteger(usage.promptTokens);
    record.inputTokenSource = 'actual';
    record.model = firstSafeIdentifier(trace.metadata?.model, record.model);
    return structuredClone(record);
  }

  getContextEngineeringRecords({ startAt, endAt } = {}) {
    const startMs = startAt ? new Date(startAt).getTime() : Number.NEGATIVE_INFINITY;
    const endMs = endAt ? new Date(endAt).getTime() : Number.POSITIVE_INFINITY;
    return this.contextEngineeringRecords.filter((entry) => {
      const timestamp = new Date(entry.recordedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs;
    }).map((entry) => structuredClone(entry));
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

  recordAiRetry(details = {}) {
    this.counters.aiRetries += 1;
    this.logger.warn('AI request retry scheduled', {
      event: 'ai_retry_scheduled',
      ...sanitizeTelemetryValue(details),
    });
  }

  recordModelRouteAttempt(details = {}) {
    this.counters.modelRouteAttempts += 1;
    this.logger.info('AI model route attempt completed', {
      event: 'ai_model_route_attempt',
      ...sanitizeTelemetryValue(details),
    });
  }

  recordModelRoutingExecution(record = {}) {
    this.counters.modelRoutingExecutions += 1;
    const safeRecord = sanitizeTelemetryValue(record);
    this.modelRoutingExecutions.unshift(safeRecord);
    this.modelRoutingExecutions.length = Math.min(
      this.modelRoutingExecutions.length,
      MAX_MODEL_ROUTING_EXECUTIONS
    );
    return safeRecord;
  }

  getModelRoutingExecutions({ startAt, endAt } = {}) {
    const startMs = startAt ? new Date(startAt).getTime() : Number.NEGATIVE_INFINITY;
    const endMs = endAt ? new Date(endAt).getTime() : Number.POSITIVE_INFINITY;
    return this.modelRoutingExecutions
      .filter((entry) => {
        const timestamp = new Date(entry.recordedAt).getTime();
        return Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs;
      })
      .map((entry) => structuredClone(entry));
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
  MAX_CONTEXT_ENGINEERING_RECORDS,
  MAX_OPERATIONAL_ERRORS,
  MAX_MODEL_ROUTING_EXECUTIONS,
  normalizeTokenUsage,
  classifyContextFailure,
  normalizeContextTokenCounts,
  safeIdentifier,
  sanitizeTelemetryValue,
};
export default new AiTelemetry();
