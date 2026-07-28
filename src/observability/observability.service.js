import { randomUUID } from 'crypto';
import { Client as LangSmithClient } from 'langsmith';
import env from '../config/env.js';
import aiTelemetry, { normalizeTokenUsage, sanitizeTelemetryValue } from '../monitoring/aiTelemetry.js';
import { estimateCost } from '../ai/evaluations/token.usage.js';
import logger from '../utils/logger.js';

function isTracingEnabled(config = env) {
  if (config.nodeEnv === 'test' && config.allowLangSmithInTest !== true) return false;
  return Boolean(config.langChainTracingV2 && config.langChainApiKey && config.langChainProject);
}

function configureLangSmithEnvironment(config = env) {
  if (config.langChainTracingV2) process.env.LANGCHAIN_TRACING ||= 'true';
  if (config.langChainProject) process.env.LANGCHAIN_PROJECT ||= config.langChainProject;
  if (config.langChainApiKey) process.env.LANGCHAIN_API_KEY ||= config.langChainApiKey;
}

class ObservabilityService {
  constructor({
    config = env,
    telemetry = aiTelemetry,
    idFactory = randomUUID,
    clock = Date,
    langSmithClient,
    log = logger,
  } = {}) {
    this.config = config;
    this.telemetry = telemetry;
    this.idFactory = idFactory;
    this.clock = clock;
    this.logger = log;
    configureLangSmithEnvironment(config);
    this.langSmithClient = langSmithClient === undefined
      ? this.createLangSmithClient()
      : langSmithClient;
  }

  getConfig() {
    return {
      enabled: isTracingEnabled(this.config),
      project: this.config.langChainProject,
      tracingV2: Boolean(this.config.langChainTracingV2),
      hasApiKey: Boolean(this.config.langChainApiKey),
    };
  }

  startTrace({ type, name, metadata = {}, parentTraceId } = {}) {
    const trace = {
      id: this.idFactory(),
      parentTraceId,
      type: type || 'ai',
      name: name || 'unnamed',
      metadata,
      startedAt: this.clock.now(),
      project: this.config.langChainProject,
      langSmithEnabled: isTracingEnabled(this.config),
      tokenUsage: null,
    };

    this.telemetry.recordTraceStarted(trace);

    const publicTrace = {
      ...trace,
      annotate: (details = {}) => {
        trace.metadata = { ...trace.metadata, ...details };
        publicTrace.metadata = trace.metadata;
      },
      end: (details = {}) => {
        this.telemetry.recordLatency(trace, this.clock.now() - trace.startedAt, details);
      },
      error: (error, details = {}) => {
        this.telemetry.recordError(trace, error, details);
      },
      recordTokenUsage: (usage = {}) => {
        const currentUsage = normalizeTokenUsage(trace.tokenUsage || {});
        const nextUsage = normalizeTokenUsage(usage);
        trace.tokenUsage = {
          promptTokens: currentUsage.promptTokens + nextUsage.promptTokens,
          completionTokens: currentUsage.completionTokens + nextUsage.completionTokens,
          totalTokens: currentUsage.totalTokens + nextUsage.totalTokens,
        };
        publicTrace.tokenUsage = trace.tokenUsage;
        this.telemetry.recordTokenUsage(trace, usage);
      },
      child: (childType, childName, childMetadata = {}) => this.startTrace({
        type: childType,
        name: childName,
        metadata: childMetadata,
        parentTraceId: trace.id,
      }),
    };

    return publicTrace;
  }

  async trace({ type, name, metadata = {}, parentTraceId, tokenUsage, outputMetadata }, operation) {
    const trace = this.startTrace({ type, name, metadata, parentTraceId });

    try {
      await this.createLangSmithRun(trace);
      const result = await operation(trace);
      const usage = typeof tokenUsage === 'function' ? tokenUsage(result) : tokenUsage;

      if (usage) trace.recordTokenUsage(usage);

      const details = typeof outputMetadata === 'function' ? outputMetadata(result) : outputMetadata;
      trace.end(details || {});
      await this.completeLangSmithRun(trace, details || {}, usage);
      return result;
    } catch (error) {
      await this.failLangSmithRun(trace, error);
      trace.error(error);
      throw error;
    }
  }

  createLangSmithClient() {
    if (!isTracingEnabled(this.config)) return null;

    return new LangSmithClient({
      apiKey: this.config.langChainApiKey,
    });
  }

  toLangSmithRunType(type) {
    const runTypes = {
      ai_execution_flow: 'chain',
      bird_identification_pipeline: 'chain',
      cache: 'tool',
      conversation_context: 'chain',
      final_response: 'chain',
      image_input: 'tool',
      llm: 'llm',
      rag_pipeline: 'chain',
      rag_retrieval: 'retriever',
      tool_execution: 'tool',
      agent_orchestration: 'chain',
      agent_planning: 'chain',
      background_job: 'chain',
      evaluation: 'chain',
      evaluation_comparison: 'chain',
      evaluation_run: 'chain',
      evaluation_score: 'chain',
      tool_sequence: 'chain',
    };

    return runTypes[type] || 'chain';
  }

  async createLangSmithRun(trace) {
    if (!this.langSmithClient || !trace.langSmithEnabled) return;

    await this.sendLangSmithUpdate('create', trace, async () => this.langSmithClient.createRun({
      id: trace.id,
      name: trace.name,
      run_type: this.toLangSmithRunType(trace.type),
      project_name: this.config.langChainProject,
      start_time: new Date(trace.startedAt).toISOString(),
      ...(trace.parentTraceId ? { parent_run_id: trace.parentTraceId } : {}),
      inputs: {
        metadata: sanitizeTelemetryValue(trace.metadata || {}),
      },
      extra: {
        metadata: {
          traceType: trace.type,
          langSmithEnabled: trace.langSmithEnabled,
          ...sanitizeTelemetryValue(trace.metadata || {}),
        },
      },
    }));
  }

  async completeLangSmithRun(trace, details = {}, usage = {}) {
    if (!this.langSmithClient || !trace.langSmithEnabled) return;

    const tokenUsage = usage ? normalizeTokenUsage(usage) : trace.tokenUsage;
    const model = details?.model || trace.metadata?.model;
    const estimatedCostUsd = model && tokenUsage
      ? estimateCost(model, tokenUsage)
      : null;

    await this.sendLangSmithUpdate('complete', trace, async () => this.langSmithClient.updateRun(trace.id, {
      end_time: new Date(this.clock.now()).toISOString(),
      outputs: sanitizeTelemetryValue({
        ...details,
        ...(estimatedCostUsd === null ? {} : { estimatedCostUsd }),
      }),
      extra: {
        metadata: {
          traceType: trace.type,
          langSmithEnabled: trace.langSmithEnabled,
          ...sanitizeTelemetryValue(trace.metadata || {}),
          ...(estimatedCostUsd === null ? {} : { estimatedCostUsd }),
        },
      },
      ...(tokenUsage ? {
        prompt_tokens: tokenUsage.promptTokens,
        completion_tokens: tokenUsage.completionTokens,
        total_tokens: tokenUsage.totalTokens,
      } : {}),
    }));
  }

  async failLangSmithRun(trace, error) {
    if (!this.langSmithClient || !trace.langSmithEnabled) return;

    await this.sendLangSmithUpdate('fail', trace, async () => this.langSmithClient.updateRun(trace.id, {
      end_time: new Date(this.clock.now()).toISOString(),
      error: error?.message || 'AI operation failed',
    }));
  }

  async sendLangSmithUpdate(action, trace, operation) {
    try {
      await operation();
    } catch (error) {
      this.logger.warn('LangSmith trace export failed', {
        event: 'langsmith_trace_export_failed',
        action,
        traceId: trace.id,
        traceType: trace.type,
        name: trace.name,
        error: {
          name: error?.name,
          message: error?.message,
          status: error?.status,
        },
      });
    }
  }
}

export {
  configureLangSmithEnvironment,
  isTracingEnabled,
  ObservabilityService,
};
export default new ObservabilityService();
