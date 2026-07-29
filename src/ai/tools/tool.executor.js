import logger from '../../utils/logger.js';
import { DEFAULT_CURRENCY, TRANSPORTATION_LABELS } from '../../constants/business.js';
import {
  traceAgentToolSequence,
  traceToolExecution,
} from '../../tracing/aiTracing.middleware.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';

export const TOOL_EXECUTION_FAILED_MESSAGE = 'I could not complete that action right now. Please try again in a moment.';
const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|apiKey|authorization|databaseUrl|customerEmail|customerName|email|phone)/i;
const MAX_TRACE_ARRAY_ITEMS = 10;
const MAX_TRACE_OBJECT_KEYS = 30;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 50;
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'RATE_LIMITED',
  'TIMEOUT',
  'TOOL_EXECUTION_FAILED',
  'TRANSIENT_ERROR',
  'TEMPORARY_ERROR',
  'SERVICE_UNAVAILABLE',
  'DATABASE_UNAVAILABLE',
]);
const PERMANENT_FAILURE_PATTERN = /^(INVALID_|VALIDATION_|MISSING_|UNKNOWN_TOOL|TOUR_NOT_FOUND|TOUR_SELECTION_|TOUR_SELECTION_MISMATCH|TRANSPORTATION_LOCATION_REQUIRED)/;
const VISITOR_BLOCKED_TOOL_MESSAGE = 'Visitors can ask about birds only. Please log in to plan tours or make reservations.';
const toOptions = (options) => options.map(([label, value]) => ({ label, value }));
const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

function buildChoiceAction() {
  return {
    type: 'choice',
    prompt: 'What would you like to do next?',
    options: toOptions([
      ['Show me details', 'show_details'],
      ['Proceed with booking', 'proceed_booking'],
      ['No thanks', 'decline'],
    ]),
  };
}

function buildTourSelectionAction(tours = []) {
  return {
    type: 'tour_selection',
    prompt: 'Which tour are you interested in?',
    options: tours.map((tour) => ({
      label: tour.name,
      value: { tourId: tour.tourId, tourName: tour.name },
      description: `${tour.location} · $${tour.pricePerPerson} · ${tour.durationHours}h · ${tour.difficulty}`,
    })),
  };
}

function buildContactAgentAction() {
  return {
    type: 'choice',
    prompt: 'No matching tours were found. Would you like a human agent to contact you?',
    options: toOptions([
      ['Contact me', 'contact_agent'],
      ['No thanks', 'decline'],
    ]),
  };
}

function buildParticipantCountAction(max = null) {
  const maxCount = Number(max);
  const options = Number.isInteger(maxCount) && maxCount > 0
    ? Array.from({ length: maxCount }, (_, index) => {
      const value = index + 1;
      return { label: String(value), value };
    })
    : [];

  return {
    type: 'participant_count',
    prompt: 'How many participants should I reserve?',
    min: 1,
    ...(maxCount > 0 ? { max: maxCount } : {}),
    ...(options.length ? { options } : {}),
  };
}

function buildConfirmReservationAction() {
  return {
    type: 'reservation_confirmation',
    prompt: 'Confirm this reservation?',
    options: toOptions([
      ['Confirm reservation', 'confirm_reservation'],
      ['Cancel', 'cancel_reservation'],
    ]),
  };
}

function buildTransportationPreferenceAction() {
  return {
    type: 'choice',
    prompt: 'Would you like transportation for this tour?',
    options: toOptions([
      ['Yes, show transportation', 'show_transportation'],
      ['No, I have my own transportation', 'decline_transportation'],
    ]),
  };
}

function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  return `${currency} ${amount}`;
}

function formatTransportationType(type) {
  if (TRANSPORTATION_LABELS[type]) return TRANSPORTATION_LABELS[type];
  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildTransportationSelectionAction(result = {}) {
  if (!Array.isArray(result.options) || result.options.length === 0) {
    return null;
  }

  return {
    type: 'transportation_selection',
    prompt: `Which transportation option would you prefer for ${result.origin} to ${result.destination}?`,
    options: result.options.map((option) => {
      const label = formatTransportationType(option.type);
      const priceDetails = option.pricePerPerson
        ? `${formatMoney(option.pricePerPerson, option.currency)} per person, ${formatMoney(option.totalPrice, option.currency)} total`
        : `${formatMoney(option.totalPrice, option.currency)} total`;

      return {
        label,
        value: {
          transportationOption: option.type,
          origin: result.origin,
          destination: result.destination,
          label,
          ...(option.pricePerPerson ? { pricePerPerson: option.pricePerPerson } : {}),
          totalPrice: option.totalPrice,
          currency: option.currency,
          estimatedTravelTime: result.estimatedTravelTime,
        },
        description: `${priceDetails} · ${result.estimatedTravelTime}`,
        recommended: option.type === result.recommendedOption,
      };
    }),
  };
}

function isTransportationSelectionAction(action) {
  return action?.type === 'transportation_selection';
}

function hasTransportationPreference(metadata = {}) {
  return Boolean(metadata.selectedTransportation || metadata.transportationDeclined);
}

function setUiAction(metadata, action) {
  if (metadata && action) metadata.uiAction = action;
}

function formatSelectedTour(result) {
  return {
    tourId: result.tourId,
    name: result.name,
    location: result.location,
    pricePerPerson: result.pricePerPerson,
    availableSlots: result.availableSlots,
    durationHours: result.durationHours,
    difficulty: result.difficulty,
  };
}

function hasCompleteCustomerContext(metadata = {}) {
  const customerContext = metadata.customerContext || {};

  return ['customerName', 'customerEmail', 'itineraryStartDate', 'itineraryEndDate']
    .every((key) => customerContext[key]);
}

function buildPricingMetadata(result = {}, metadata = {}) {
  const currency = result.currency || metadata.selectedTransportation?.currency || 'USD';
  const tourSubtotal = Number(result.totalPrice ?? result.total ?? result.subtotal);
  const transportationTotal = Number(metadata.selectedTransportation?.totalPrice || 0);

  if (!Number.isFinite(tourSubtotal)) {
    return null;
  }

  return {
    tourSubtotal,
    ...(transportationTotal > 0 ? { transportationTotal } : {}),
    total: Number((tourSubtotal + (Number.isFinite(transportationTotal) ? transportationTotal : 0)).toFixed(2)),
    currency,
  };
}

function buildTourSearchAction(tours = []) {
  if (tours.length === 0) return buildContactAgentAction();
  return tours.length === 1 ? buildChoiceAction() : buildTourSelectionAction(tours);
}

function appendToolMetadata(metadata, toolName, result, args = {}) {
  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  metadata.toolsCalled = [...(metadata.toolsCalled || []), toolName];

  if (args.participants) {
    metadata.participants = Number(args.participants);
  } else if (result?.participants) {
    metadata.participants = Number(result.participants);
  }

  if (Array.isArray(result?.tours)) {
    metadata.tours = result.tours;
    setUiAction(metadata, buildTourSearchAction(result.tours));
  }

  if (toolName === 'calculateTransportation' && result?.success) {
    setUiAction(metadata, buildTransportationSelectionAction(result));
  }

  if (result?.selectedTour) {
    metadata.selectedTour = result.selectedTour;
    metadata.selectedTourId = result.selectedTour.tourId;
  }

  if (toolName === 'checkAvailability' && result?.success && result?.tourId) {
    metadata.selectedTour = formatSelectedTour(result);
    metadata.selectedTourId = result.tourId;

    if ([
      'select_tour',
      'proceed_booking',
      'transportation_selected',
      'transportation_declined',
      'needs_clarification',
      'needs_confirmation',
      'needs_transportation_preference',
    ].includes(metadata.agentPlan?.status)) {
      if (!args.participants) {
        setUiAction(metadata, buildParticipantCountAction(result.availableSlots));
      } else if (metadata.agentPlan?.status === 'needs_transportation_preference') {
        setUiAction(metadata, buildTransportationPreferenceAction());
      } else if (
        hasCompleteCustomerContext(metadata)
        && hasTransportationPreference(metadata)
        && !isTransportationSelectionAction(metadata.uiAction)
      ) {
        setUiAction(metadata, buildConfirmReservationAction());
      }
    }
  }

  if (result?.tourId && ['checkAvailability', 'calculatePricing'].includes(toolName)) {
    metadata.selectedTourId ||= result.tourId;
  }

  if (result?.participants && ['calculatePricing', 'createReservation'].includes(toolName)) {
    metadata.participants = Number(result.participants);
  }

  if (toolName === 'calculatePricing' && result?.success) {
    const pricing = buildPricingMetadata(result, metadata);

    if (pricing) metadata.pricing = pricing;
  }

  if (result?.reservation) {
    metadata.reservation = result.reservation;
  } else if (toolName === 'createReservation' && result?.success) {
    metadata.reservation = result;
  }
}

function sanitizeTraceValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (depth >= 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_TRACE_ARRAY_ITEMS)
      .map((item) => sanitizeTraceValue(item, depth + 1));
  }

  return Object.fromEntries(Object.entries(value)
    .slice(0, MAX_TRACE_OBJECT_KEYS)
    .map(([key, entryValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeTraceValue(entryValue, depth + 1),
    ]));
}

function normalizeRetryOptions(options = {}) {
  const toNonNegativeNumber = (value, fallback) => {
    const numberValue = Number(value ?? fallback);
    return Number.isFinite(numberValue) ? Math.max(0, numberValue) : fallback;
  };

  return {
    retries: toNonNegativeNumber(options.retries ?? options.maxRetries, DEFAULT_RETRIES),
    baseDelayMs: toNonNegativeNumber(options.baseDelayMs ?? options.delayMs, DEFAULT_RETRY_DELAY_MS),
  };
}

function errorSummary(error) {
  return sanitizeTraceValue({
    name: error?.name,
    code: error?.code,
    status: error?.status,
    message: error?.message,
  });
}

function isRetryableCode(code) {
  return code && RETRYABLE_ERROR_CODES.has(code);
}

function isRetryableFailure(result = {}) {
  if (result?.success !== false || result.retryable === false) return false;
  if (result.retryable === true) return true;
  if (PERMANENT_FAILURE_PATTERN.test(result.code || '')) return false;
  return isRetryableCode(result.code);
}

function isRetryableError(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.retryable === false) return false;
  return error?.retryable === true || RETRYABLE_STATUSES.has(error?.status) || isRetryableCode(error?.code) || !error?.code;
}

function isTimeoutFailure(failure = {}) {
  return failure.code === 'ETIMEDOUT'
    || failure.code === 'TIMEOUT'
    || failure.code === 'LOCK_TIMEOUT'
    || failure.name === 'TimeoutError'
    || /timeout|timed out/i.test(failure.message || '');
}

function monitorToolFailure(toolName, metadata = {}, failure = {}, details = {}) {
  aiTelemetry.recordAiError(isTimeoutFailure(failure) ? 'tool_timeout' : 'tool_failed', {
    toolName,
    conversationId: metadata.conversationId,
    userId: metadata.userId,
    aiTraceId: metadata.aiTraceId,
    role: metadata.role,
    planStatus: metadata.agentPlan?.status,
    failure: sanitizeTraceValue(failure),
    ...details,
  });
}

function attachAttempts(result, attempts) {
  const safeResult = result && typeof result === 'object'
    ? result
    : { success: false, code: 'TOOL_EXECUTION_FAILED', message: TOOL_EXECUTION_FAILED_MESSAGE };
  defineHidden(safeResult, 'toolExecutionAttempts', attempts);
  return safeResult;
}

function extractTransportationCost(result = {}) {
  if (Number.isFinite(Number(result.transportationCost))) {
    return Number(result.transportationCost);
  }

  const options = Array.isArray(result.options) ? result.options : [];
  const recommended = options.find((option) => option.type === result.recommendedOption) || options[0];
  const totalPrice = Number(recommended?.totalPrice);

  return Number.isFinite(totalPrice) ? totalPrice : undefined;
}

function summarizeIntermediateState(toolName, result = {}) {
  const summary = {};
  const setNumber = (key, value) => {
    if (Number.isFinite(Number(value))) summary[key] = Number(value);
  };

  if (result?.success === false) {
    Object.assign(summary, {
      success: false,
      code: result.code,
      message: result.message,
    });
  }

  if (Array.isArray(result?.tours)) summary.toursFound = result.tours.length;

  if (result?.selectedTour?.tourId) {
    summary.selectedTourId = result.selectedTour.tourId;
    summary.selectedTourName = result.selectedTour.name;
  }

  if (result?.tourId) summary.selectedTourId = result.tourId;
  setNumber('availableSlots', result?.availableSlots);

  if (toolName === 'calculateTransportation') {
    const transportationCost = extractTransportationCost(result);

    if (transportationCost !== undefined) summary.transportationCost = transportationCost;
    if (result?.recommendedOption) summary.recommendedTransportationOption = result.recommendedOption;
  }

  setNumber('totalPrice', result?.totalPrice);
  setNumber('finalTotal', result?.finalTotal);
  if (result?.currency) summary.currency = result.currency;

  if (result?.reservation?.reservationId || result?.reservationId) {
    summary.reservationId = result.reservation?.reservationId || result.reservationId;
  }

  return sanitizeTraceValue(summary);
}

function getTaskKey(step = {}, index) {
  return step.id || step.taskId || step.tool || `step_${index + 1}`;
}

function buildPlanTrace(plan = {}) {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];

  return {
    status: plan.status,
    tools: steps.map((step) => step.tool).filter(Boolean),
    stepCount: steps.length,
    reasoningSummary: plan.message
      || `Planned ${steps.length} tool step${steps.length === 1 ? '' : 's'} for status "${plan.status || 'unknown'}".`,
  };
}

function defineHidden(object, key, value) {
  Object.defineProperty(object, key, { value, enumerable: false, configurable: true, writable: true });
}

function createExecutionContext(plan = {}, metadata = {}) {
  const context = {
    steps: [],
    results: {},
    errors: [],
    debugTrace: {
      plan: buildPlanTrace(plan),
      events: [], executions: [], intermediateState: {}, errors: [], skippedSteps: [],
    },
  };

  defineHidden(metadata, 'agentExecutionContext', context);
  defineHidden(metadata, 'agentDebugTrace', context.debugTrace);

  return context;
}

function recordTraceEvent(context, event, details = {}) {
  context.debugTrace.events.push({
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeTraceValue(details),
  });
}

function storeIntermediateResult(context, step, result, index) {
  const key = getTaskKey(step, index);
  const executedStep = { ...step, id: key, result };

  context.steps.push(executedStep);
  context.results[key] = result;

  if (step.tool && key !== step.tool) {
    context.results[step.tool] = result;
  }

  const stateSummary = summarizeIntermediateState(step.tool, result);
  context.debugTrace.executions.push({
    id: key,
    tool: step.tool,
    status: result?.success === false ? 'failed' : 'succeeded',
    input: sanitizeTraceValue(step.args || {}),
    result: sanitizeTraceValue(result),
    attempts: result.toolExecutionAttempts || [],
    intermediateState: stateSummary,
  });
  context.debugTrace.intermediateState[key] = stateSummary;

  if (result?.success === false) {
    const errorSummary = { id: key, tool: step.tool, code: result.code, message: result.message };

    context.errors.push(errorSummary);
    context.debugTrace.errors.push(errorSummary);
  }

  return executedStep;
}

function storeSkippedSteps(context, steps, startIndex) {
  steps.slice(startIndex).forEach((step, offset) => {
    const skippedStep = {
      id: getTaskKey(step, startIndex + offset),
      tool: step.tool,
      input: sanitizeTraceValue(step.args || {}),
      reason: 'Skipped after a previous tool failed.',
    };

    context.debugTrace.skippedSteps.push(skippedStep);
    recordTraceEvent(context, 'tool_step_skipped', skippedStep);
  });
}

export class ToolExecutor {
  constructor(handlers = {}, options = {}) {
    this.handlers = new Map(Object.entries(handlers));
    this.logger = options.logger || logger;
    this.retryOptions = options.retry || {};
  }

  hasTool(name) {
    return this.handlers.has(name);
  }

  getRetryOptions(name, step = {}) {
    return normalizeRetryOptions({
      ...this.retryOptions,
      ...(this.retryOptions.tools?.[name] || this.retryOptions.byTool?.[name] || {}),
      ...(step.retry || {}),
      ...(step.retries !== undefined ? { retries: step.retries } : {}),
    });
  }

  async execute(name, args = {}, metadata = {}, options = {}) {
    const handler = this.handlers.get(name);
    const attempts = [];
    const retryOptions = this.getRetryOptions(name, options.step);

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

      return attachAttempts({
        success: false,
        code: 'VISITOR_TOOL_FORBIDDEN',
        message: VISITOR_BLOCKED_TOOL_MESSAGE,
        retryable: false,
      }, attempts);
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

      return attachAttempts({
        success: false,
        code: 'UNKNOWN_TOOL',
        message: `Tool ${name} is not available.`,
      }, attempts);
    }

    for (let attempt = 0; attempt <= retryOptions.retries; attempt += 1) {
      try {
        const result = await handler(args || {}, metadata);
        const shouldRetry = isRetryableFailure(result) && attempt < retryOptions.retries;
        attempts.push({
          attempt: attempt + 1,
          status: result?.success === false ? 'failed' : 'succeeded',
          retryable: isRetryableFailure(result),
          ...(result?.success === false ? { result: sanitizeTraceValue(result) } : {}),
        });

        if (result?.success === false) {
          monitorToolFailure(name, metadata, {
            code: result.code,
            message: result.message,
          }, {
            attempt: attempt + 1,
            retryable: isRetryableFailure(result),
            willRetry: shouldRetry,
          });
        }

        if (shouldRetry) {
          this.logRetry(name, metadata, attempt + 1, retryOptions, { code: result.code, message: result.message });
          await wait(retryOptions.baseDelayMs * 2 ** attempt);
          continue;
        }

        appendToolMetadata(metadata, name, result, args || {});
        this.logger.info('Agent tool call completed', {
          toolName: name,
          success: result?.success !== false,
          attempts: attempts.length,
          conversationId: metadata.conversationId,
        });
        return attachAttempts(result, attempts);
      } catch (error) {
        const shouldRetry = isRetryableError(error) && attempt < retryOptions.retries;
        attempts.push({
          attempt: attempt + 1,
          status: 'failed',
          retryable: isRetryableError(error),
          error: errorSummary(error),
        });

        monitorToolFailure(name, metadata, errorSummary(error), {
          attempt: attempt + 1,
          retryable: isRetryableError(error),
          willRetry: shouldRetry,
        });

        if (shouldRetry) {
          this.logRetry(name, metadata, attempt + 1, retryOptions, errorSummary(error));
          await wait(retryOptions.baseDelayMs * 2 ** attempt);
          continue;
        }

        this.logger.warn('Agent tool call failed', {
          toolName: name,
          error: error.message,
          attempts: attempts.length,
          conversationId: metadata.conversationId,
        });

        return attachAttempts({
          success: false,
          code: 'TOOL_EXECUTION_FAILED',
          message: TOOL_EXECUTION_FAILED_MESSAGE,
        }, attempts);
      }
    }

    return attachAttempts({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      message: TOOL_EXECUTION_FAILED_MESSAGE,
    }, attempts);
  }

  logRetry(name, metadata, attempt, retryOptions, failure) {
    if (metadata.agentExecutionContext) {
      recordTraceEvent(metadata.agentExecutionContext, 'tool_retry_scheduled', {
        tool: name,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: retryOptions.retries + 1,
        failure: sanitizeTraceValue(failure),
      });
    }

    this.logger.warn('Retrying agent tool call after retryable failure', {
      toolName: name,
      attempt,
      nextAttempt: attempt + 1,
      maxAttempts: retryOptions.retries + 1,
      conversationId: metadata.conversationId,
      failure: sanitizeTraceValue(failure),
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
