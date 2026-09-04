import { sanitizeToolTraceValue } from './toolExecutionPolicy.js';

function defineHidden(object, key, value) {
  Object.defineProperty(object, key, { value, enumerable: false, configurable: true, writable: true });
}

export function attachToolAttempts(result, attempts, fallbackMessage) {
  const safeResult = result && typeof result === 'object'
    ? result
    : { success: false, code: 'TOOL_EXECUTION_FAILED', message: fallbackMessage };
  defineHidden(safeResult, 'toolExecutionAttempts', attempts);
  return safeResult;
}

export function getTaskKey(step = {}, index) {
  return step.id || step.taskId || step.tool || `step_${index + 1}`;
}

export function createExecutionContext(plan = {}, metadata = {}) {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const context = {
    steps: [],
    results: {},
    errors: [],
    debugTrace: {
      plan: {
        status: plan.status,
        tools: steps.map((step) => step.tool).filter(Boolean),
        stepCount: steps.length,
        reasoningSummary: plan.message
          || `Planned ${steps.length} tool step${steps.length === 1 ? '' : 's'} for status "${plan.status || 'unknown'}".`,
      },
      events: [],
      executions: [],
      intermediateState: {},
      errors: [],
      skippedSteps: [],
    },
  };
  defineHidden(metadata, 'agentExecutionContext', context);
  defineHidden(metadata, 'agentDebugTrace', context.debugTrace);
  return context;
}

export function recordTraceEvent(context, event, details = {}) {
  context.debugTrace.events.push({
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeToolTraceValue(details),
  });
}

function summarizeIntermediateState(toolName, result = {}) {
  const summary = {};
  const setNumber = (key, value) => {
    if (Number.isFinite(Number(value))) summary[key] = Number(value);
  };
  if (result?.success === false) {
    Object.assign(summary, { success: false, code: result.code, message: result.message });
  }
  if (Array.isArray(result?.tours)) summary.toursFound = result.tours.length;
  if (result?.selectedTour?.tourId) {
    summary.selectedTourId = result.selectedTour.tourId;
    summary.selectedTourName = result.selectedTour.name;
  }
  if (result?.tourId) summary.selectedTourId = result.tourId;
  setNumber('availableSlots', result?.availableSlots);
  if (toolName === 'calculateTransfer') {
    const options = Array.isArray(result.options) ? result.options : [];
    const recommended = options.find((option) => option.type === result.recommendedOption) || options[0];
    const cost = Number.isFinite(Number(result.transferCost))
      ? Number(result.transferCost) : Number(recommended?.totalPrice);
    if (Number.isFinite(cost)) summary.transferCost = cost;
    if (result?.recommendedOption) summary.recommendedTransferOption = result.recommendedOption;
  }
  setNumber('totalPrice', result?.totalPrice);
  setNumber('finalTotal', result?.finalTotal);
  if (result?.currency) summary.currency = result.currency;
  if (result?.reservation?.reservationId || result?.reservationId) {
    summary.reservationId = result.reservation?.reservationId || result.reservationId;
  }
  return sanitizeToolTraceValue(summary);
}

export function storeIntermediateResult(context, step, result, index) {
  const key = getTaskKey(step, index);
  const executedStep = { ...step, id: key, result };
  context.steps.push(executedStep);
  context.results[key] = result;
  if (step.tool && key !== step.tool) context.results[step.tool] = result;

  const stateSummary = summarizeIntermediateState(step.tool, result);
  context.debugTrace.executions.push({
    id: key,
    tool: step.tool,
    status: result?.success === false ? 'failed' : 'succeeded',
    input: sanitizeToolTraceValue(step.args || {}),
    result: sanitizeToolTraceValue(result),
    attempts: result.toolExecutionAttempts || [],
    intermediateState: stateSummary,
  });
  context.debugTrace.intermediateState[key] = stateSummary;
  if (result?.success === false) {
    const error = { id: key, tool: step.tool, code: result.code, message: result.message };
    context.errors.push(error);
    context.debugTrace.errors.push(error);
  }
  return executedStep;
}

export function storeSkippedSteps(context, steps, startIndex) {
  steps.slice(startIndex).forEach((step, offset) => {
    const skippedStep = {
      id: getTaskKey(step, startIndex + offset),
      tool: step.tool,
      input: sanitizeToolTraceValue(step.args || {}),
      reason: 'Skipped after a previous tool failed.',
    };
    context.debugTrace.skippedSteps.push(skippedStep);
    recordTraceEvent(context, 'tool_step_skipped', skippedStep);
  });
}
