import logger from '../../utils/logger.js';
import { traceAgentToolSequence, traceToolExecution } from '../../tracing/aiTracing.middleware.js';
import { appendToolResponseMetadata } from './toolResponseMetadata.js';
import { validateToolArguments } from './toolArgumentValidation.js';
import {
  isRetryableToolError,
  isRetryableToolResult,
  monitorToolFailure,
  normalizeRetryOptions,
  sanitizeToolTraceValue,
  summarizeToolError,
} from './toolExecutionPolicy.js';
import {
  attachToolAttempts,
  createExecutionContext,
  getTaskKey,
  recordTraceEvent,
  storeIntermediateResult,
  storeSkippedSteps,
} from './toolExecutionState.js';
import toolResultReferenceService from '../../services/toolResultReference.service.js';
import { persistLargeToolResult } from '../compaction/toolResultReference.js';
import {
  attachToolContextValidation,
  validateToolResultForContext,
} from './toolResultValidation.js';

export const TOOL_EXECUTION_FAILED_MESSAGE = 'I could not complete that action right now. Please try again in a moment.';
export const TOOL_RESULT_INDETERMINATE_MESSAGE =
  'The reservation status could not be verified. Please check its status before trying again.';
const VISITOR_BLOCKED_TOOL_MESSAGE = 'Visitors can ask about birds only. Please log in to plan tours or make reservations.';
const NON_RETRYABLE_SIDE_EFFECT_TOOLS = new Set(['createReservation']);
const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * Executes validated tool plans. Handlers remain responsible for their
 * tool-specific argument contracts; this stage owns authorization, retries,
 * state transitions, tracing, and response metadata.
 */
export class ToolExecutor {
  constructor(handlers = {}, options = {}) {
    this.handlers = new Map(Object.entries(handlers));
    this.logger = options.logger || logger;
    this.retryOptions = options.retry || {};
    this.toolResultStore = options.toolResultStore || toolResultReferenceService;
    this.clock = options.clock || (() => new Date());
  }

  hasTool(name) {
    return this.handlers.has(name);
  }

  getRetryOptions(name, step = {}) {
    const retryOptions = normalizeRetryOptions({
      ...this.retryOptions,
      ...(this.retryOptions.tools?.[name] || this.retryOptions.byTool?.[name] || {}),
      ...(step.retry || {}),
      ...(step.retries !== undefined ? { retries: step.retries } : {}),
    });

    return NON_RETRYABLE_SIDE_EFFECT_TOOLS.has(name)
      ? { ...retryOptions, retries: 0 }
      : retryOptions;
  }

  async execute(name, args = {}, metadata = {}, options = {}) {
    const handler = this.handlers.get(name);
    const attempts = [];
    const retryOptions = this.getRetryOptions(name, options.step);
    const argumentValidation = validateToolArguments(args);

    if (metadata.role === 'visitor') {
      attempts.push({
        attempt: 1,
        status: 'failed',
        retryable: false,
        result: { success: false, code: 'VISITOR_TOOL_FORBIDDEN', message: VISITOR_BLOCKED_TOOL_MESSAGE },
      });
      this.logger.warn('Visitor attempted restricted agent tool', {
        toolName: name,
        conversationId: metadata.conversationId,
      });
      return attachToolAttempts({
        success: false,
        code: 'VISITOR_TOOL_FORBIDDEN',
        message: VISITOR_BLOCKED_TOOL_MESSAGE,
        retryable: false,
      }, attempts, TOOL_EXECUTION_FAILED_MESSAGE);
    }

    if (!handler) {
      attempts.push({
        attempt: 1,
        status: 'failed',
        retryable: false,
        result: { success: false, code: 'UNKNOWN_TOOL', message: `Tool ${name} is not available.` },
      });
      this.logger.warn('Unknown agent tool requested', {
        toolName: name,
        conversationId: metadata.conversationId,
      });
      return attachToolAttempts({
        success: false,
        code: 'UNKNOWN_TOOL',
        message: `Tool ${name} is not available.`,
      }, attempts, TOOL_EXECUTION_FAILED_MESSAGE);
    }

    if (argumentValidation.valid === false) {
      const result = {
        success: false,
        code: argumentValidation.code,
        message: argumentValidation.message,
        retryable: false,
      };
      attempts.push({
        attempt: 1,
        status: 'failed',
        retryable: false,
        result,
      });
      return attachToolAttempts(result, attempts, TOOL_EXECUTION_FAILED_MESSAGE);
    }

    const validatedArgs = argumentValidation.args || {};

    for (let attempt = 0; attempt <= retryOptions.retries; attempt += 1) {
      try {
        const result = await handler(validatedArgs, metadata);
        const contextValidation = validateToolResultForContext(name, result, {
          metadata,
          status: result?.status,
          now: this.clock(),
        });
        attachToolContextValidation(result, contextValidation);
        const retryable = NON_RETRYABLE_SIDE_EFFECT_TOOLS.has(name)
          ? false
          : isRetryableToolResult(result);
        const shouldRetry = retryable && attempt < retryOptions.retries;
        attempts.push({
          attempt: attempt + 1,
          status: result?.success === false ? 'failed' : 'succeeded',
          retryable,
          ...(result?.success === false ? { result: sanitizeToolTraceValue(result) } : {}),
        });

        if (result?.success === false) {
          monitorToolFailure(name, metadata, {
            code: result.code,
            message: result.message,
          }, {
            attempt: attempt + 1,
            retryable,
            willRetry: shouldRetry,
          });
        }

        if (shouldRetry) {
          this.logRetry(name, metadata, attempt + 1, retryOptions, {
            code: result.code,
            message: result.message,
          });
          await wait(retryOptions.baseDelayMs * 2 ** attempt);
          continue;
        }

        await persistLargeToolResult({
          toolName: name,
          result,
          metadata,
          store: this.toolResultStore,
          logger: this.logger,
        });
        appendToolResponseMetadata(metadata, name, result, validatedArgs);
        if (!contextValidation.valid) {
          metadata.toolContextRejections = [
            ...(metadata.toolContextRejections || []),
            { tool: name, reason: contextValidation.reason },
          ];
        }
        this.logger.info('Agent tool call completed', {
          toolName: name,
          success: result?.success !== false,
          attempts: attempts.length,
          conversationId: metadata.conversationId,
        });
        return attachToolAttempts(result, attempts, TOOL_EXECUTION_FAILED_MESSAGE);
      } catch (error) {
        const retryable = NON_RETRYABLE_SIDE_EFFECT_TOOLS.has(name)
          ? false
          : isRetryableToolError(error);
        const shouldRetry = retryable && attempt < retryOptions.retries;
        const failure = summarizeToolError(error);
        attempts.push({
          attempt: attempt + 1,
          status: 'failed',
          retryable,
          error: failure,
        });
        monitorToolFailure(name, metadata, failure, {
          attempt: attempt + 1,
          retryable,
          willRetry: shouldRetry,
        });

        if (shouldRetry) {
          this.logRetry(name, metadata, attempt + 1, retryOptions, failure);
          await wait(retryOptions.baseDelayMs * 2 ** attempt);
          continue;
        }

        this.logger.warn('Agent tool call failed', {
          toolName: name,
          error: error.message,
          attempts: attempts.length,
          conversationId: metadata.conversationId,
        });
        const indeterminate = NON_RETRYABLE_SIDE_EFFECT_TOOLS.has(name);
        return attachToolAttempts({
          success: false,
          code: indeterminate ? 'TOOL_RESULT_INDETERMINATE' : 'TOOL_EXECUTION_FAILED',
          message: indeterminate ? TOOL_RESULT_INDETERMINATE_MESSAGE : TOOL_EXECUTION_FAILED_MESSAGE,
          retryable: false,
        }, attempts, indeterminate ? TOOL_RESULT_INDETERMINATE_MESSAGE : TOOL_EXECUTION_FAILED_MESSAGE);
      }
    }

    return attachToolAttempts({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      message: TOOL_EXECUTION_FAILED_MESSAGE,
    }, attempts, TOOL_EXECUTION_FAILED_MESSAGE);
  }

  logRetry(name, metadata, attempt, retryOptions, failure) {
    if (metadata.agentExecutionContext) {
      recordTraceEvent(metadata.agentExecutionContext, 'tool_retry_scheduled', {
        tool: name,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: retryOptions.retries + 1,
        failure: sanitizeToolTraceValue(failure),
      });
    }
    this.logger.warn('Retrying agent tool call after retryable failure', {
      toolName: name,
      attempt,
      nextAttempt: attempt + 1,
      maxAttempts: retryOptions.retries + 1,
      conversationId: metadata.conversationId,
      failure: sanitizeToolTraceValue(failure),
    });
  }

  async executePlan(plan = {}, metadata = {}) {
    return traceAgentToolSequence('birdwatching_agent_tool_sequence', {
      parentTraceId: metadata.agentTraceId,
      conversationId: metadata.conversationId,
      role: metadata.role,
      status: plan.status,
      stepCount: Array.isArray(plan.steps) ? plan.steps.length : 0,
      tools: (plan.steps || []).map((step) => step.tool).filter(Boolean),
      aiTraceId: metadata.aiTraceId,
    }, async (trace) => {
      metadata.agentToolSequenceTraceId = trace.id;
      return this.executePlanUntraced(plan, metadata);
    });
  }

  async executePlanUntraced(plan = {}, metadata = {}) {
    const context = createExecutionContext(plan, metadata);
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    recordTraceEvent(context, 'tool_plan_started', {
      status: plan.status,
      stepCount: steps.length,
      tools: steps.map((step) => step.tool).filter(Boolean),
    });
    this.logger.info('Agent tool plan execution started', {
      conversationId: metadata.conversationId,
      status: plan.status,
      stepCount: steps.length,
      tools: steps.map((step) => step.tool).filter(Boolean),
    });

    for (const [index, step] of steps.entries()) {
      const stepId = getTaskKey(step, index);
      const startedAt = Date.now();
      recordTraceEvent(context, 'tool_step_started', {
        id: stepId,
        tool: step.tool,
        index,
        input: step.args || {},
      });
      this.logger.info('Agent tool step started', {
        conversationId: metadata.conversationId,
        id: stepId,
        toolName: step.tool,
        index,
      });

      const result = await traceToolExecution(step.tool || 'unknown_agent_tool', {
        parentTraceId: metadata.agentToolSequenceTraceId,
        conversationId: metadata.conversationId,
        role: metadata.role,
        planStatus: plan.status,
        stepId,
        stepIndex: index,
        hasArguments: Boolean(step.args && Object.keys(step.args).length),
        aiTraceId: metadata.aiTraceId,
      }, () => this.execute(step.tool, step.args || {}, metadata, { step }));
      storeIntermediateResult(context, step, result, index);

      recordTraceEvent(context, 'tool_step_completed', {
        id: stepId,
        tool: step.tool,
        index,
        status: result?.success === false ? 'failed' : 'succeeded',
        code: result?.code,
        attempts: result.toolExecutionAttempts?.length || 0,
        durationMs: Date.now() - startedAt,
      });
      this.logger.info('Agent tool step completed', {
        conversationId: metadata.conversationId,
        id: stepId,
        toolName: step.tool,
        index,
        success: result?.success !== false,
        code: result?.code,
        attempts: result.toolExecutionAttempts?.length || 0,
        durationMs: Date.now() - startedAt,
      });
      if (result?.success === false && step.stopOnFailure !== false) {
        storeSkippedSteps(context, steps, index + 1);
        break;
      }
    }

    recordTraceEvent(context, 'tool_plan_completed', {
      success: context.errors.length === 0,
      executedStepCount: context.steps.length,
      errorCount: context.errors.length,
      skippedStepCount: context.debugTrace.skippedSteps.length,
    });
    this.logger.info('Agent tool plan execution completed', {
      conversationId: metadata.conversationId,
      success: context.errors.length === 0,
      executedStepCount: context.steps.length,
      errorCount: context.errors.length,
      skippedStepCount: context.debugTrace.skippedSteps.length,
    });
    return Object.assign(context, {
      success: context.errors.length === 0,
      finalOutput: context.results,
    });
  }
}
