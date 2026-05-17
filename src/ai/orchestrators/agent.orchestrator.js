import openaiClient from '../openai.client.js';
import birdwatchingAgent from '../agents/birdwatching.agent.js';
import logger from '../../utils/logger.js';

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function buildToolContextMessage(plan, toolResults) {
  const steps = Array.isArray(toolResults) ? toolResults : toolResults?.steps || [];

  if (!steps.length) {
    return null;
  }

  return {
    role: 'system',
    content: [
      'Internal birdwatching platform tool results follow.',
      'Use them to answer naturally. Do not expose raw JSON, implementation details, stack traces, SQL, or provider internals.',
      `Planner status: ${plan.status}`,
      safeJson(steps.map((step) => ({
        tool: step.tool,
        result: step.result,
      }))),
    ].join('\n'),
  };
}

function buildReasoningSummary(plan = {}, toolResults = {}) {
  const executedTools = (toolResults.steps || []).map((step) => step.tool).filter(Boolean);
  const failedTools = (toolResults.errors || []).map((error) => error.tool).filter(Boolean);

  if (failedTools.length) {
    return `Planner selected status "${plan.status}" and stopped after failed tool(s): ${failedTools.join(', ')}.`;
  }

  if (executedTools.length) {
    return `Planner selected status "${plan.status}" and completed tool sequence: ${executedTools.join(' -> ')}.`;
  }

  return `Planner selected status "${plan.status}" and no tools were required.`;
}

function attachDebugTraceSummary(metadata = {}, plan = {}, toolResults = {}) {
  const trace = metadata.agentDebugTrace || toolResults.debugTrace;

  if (!trace) {
    return null;
  }

  trace.reasoningSummary = buildReasoningSummary(plan, toolResults);
  trace.plan.reasoningSummary = trace.reasoningSummary;

  return trace;
}

function recordTraceEvent(metadata = {}, event, details = {}) {
  metadata.agentDebugTrace?.events?.push({
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

function buildPlannerMessage(plan) {
  if (!plan.message) {
    return null;
  }

  return {
    role: 'system',
    content: [
      'Internal planner guidance for the final response:',
      plan.message,
      'Ask for the missing confirmation or details clearly and do not claim a reservation was created unless createReservation succeeded.',
    ].join('\n'),
  };
}

function buildReservationFailureMessage(toolResults = {}) {
  const failedReservation = (toolResults.errors || []).find((error) => error.tool === 'createReservation');

  if (!failedReservation) {
    return null;
  }

  return {
    role: 'system',
    content: [
      'Reservation creation failed.',
      'The reservation was not saved in the database, so do not say it is confirmed.',
      'Apologize briefly, explain that the booking could not be completed right now, and ask the customer to try again or contact support.',
      failedReservation.message ? `Safe failure message: ${failedReservation.message}` : null,
    ].filter(Boolean).join('\n'),
  };
}

function buildKnownBookingContextMessage(metadata = {}) {
  const knownContext = {
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
    ...(metadata.selectedTransportation ? { selectedTransportation: metadata.selectedTransportation } : {}),
    ...(metadata.transportationDeclined ? { transportationDeclined: metadata.transportationDeclined } : {}),
    ...(metadata.selectedTour ? { selectedTour: metadata.selectedTour } : {}),
    ...(metadata.selectedTourId ? { selectedTourId: metadata.selectedTourId } : {}),
    ...(metadata.participants ? { participants: metadata.participants } : {}),
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
  };

  if (Object.keys(knownContext).length === 0) {
    return null;
  }

  return {
    role: 'system',
    content: [
      'Known booking context from application metadata follows.',
      'Treat these values as already provided by the user. Do not ask the user to repeat them.',
      safeJson(knownContext),
    ].join('\n'),
  };
}

function getLatestUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

function buildConversationContext(messages = [], metadata = {}) {
  const recentMetadata = metadata.conversationContext?.recentAssistantMetadata || {};

  return {
    selectedTour: metadata.selectedTour || recentMetadata.selectedTour,
    selectedTourId: metadata.selectedTourId || recentMetadata.selectedTourId,
    participants: metadata.participants || recentMetadata.participants,
    selectedTransportation: metadata.selectedTransportation || recentMetadata.selectedTransportation,
    transportationDeclined: metadata.transportationDeclined || recentMetadata.transportationDeclined,
    recentMetadata,
    recentTours: recentMetadata.tours || [],
    recentToolsCalled: recentMetadata.toolsCalled || [],
    reservation: metadata.reservation,
    customerContext: metadata.customerContext,
    messages,
  };
}

export class AgentOrchestrator {
  constructor({
    agent = birdwatchingAgent,
    aiClient = openaiClient,
    log = logger,
  } = {}) {
    this.agent = agent;
    this.aiClient = aiClient;
    this.logger = log;
  }

  async generateResponse(messages, metadata = {}, options = {}) {
    const usage = options.usage || {};
    const onChunk = options.onChunk || (() => {});
    const userMessage = getLatestUserMessage(messages);
    const conversationContext = buildConversationContext(messages, metadata);

    this.logger.info('Birdwatching agent orchestration started', {
      conversationId: metadata.conversationId,
      messageCount: messages.length,
      hasSelectedTour: Boolean(conversationContext.selectedTour || conversationContext.selectedTourId),
      hasSelectedTransportation: Boolean(conversationContext.selectedTransportation),
      transportationDeclined: Boolean(conversationContext.transportationDeclined),
      recentToolCount: conversationContext.recentToolsCalled.length,
    });

    const plan = this.agent.planner.plan({
      message: userMessage,
      context: conversationContext,
    });

    metadata.agentPlan = {
      status: plan.status,
      tools: (plan.steps || []).map((step) => step.tool),
    };

    this.logger.info('Birdwatching agent planning completed', {
      conversationId: metadata.conversationId,
      status: plan.status,
      stepCount: plan.steps?.length || 0,
      tools: metadata.agentPlan.tools,
      hasPlannerMessage: Boolean(plan.message),
    });

    if (plan.selectedTransportation || conversationContext.selectedTransportation) {
      metadata.selectedTransportation = plan.selectedTransportation
        || conversationContext.selectedTransportation;
    }

    if (plan.transportationDeclined || conversationContext.transportationDeclined) {
      metadata.transportationDeclined = true;
    }

    this.logger.info('Birdwatching agent tool execution starting', {
      conversationId: metadata.conversationId,
      status: plan.status,
      tools: metadata.agentPlan.tools,
    });

    const toolResults = await this.agent.executor.executePlan(plan, metadata);
    recordTraceEvent(metadata, 'orchestration_tools_completed', {
      status: plan.status,
      success: toolResults.success,
      executedStepCount: toolResults.steps?.length || 0,
      errorCount: toolResults.errors?.length || 0,
    });
    const debugTrace = attachDebugTraceSummary(metadata, plan, toolResults);
    const toolContextMessage = buildToolContextMessage(plan, toolResults);
    const knownBookingContextMessage = buildKnownBookingContextMessage(metadata);
    const reservationFailureMessage = buildReservationFailureMessage(toolResults);
    const plannerMessage = buildPlannerMessage(plan);
    const finalMessages = [
      ...messages,
      toolContextMessage,
      knownBookingContextMessage,
      reservationFailureMessage,
      plannerMessage,
    ].filter(Boolean);

    recordTraceEvent(metadata, 'orchestration_prompt_assembled', {
      finalMessageCount: finalMessages.length,
      hasToolContext: Boolean(toolContextMessage),
      hasKnownBookingContext: Boolean(knownBookingContextMessage),
      hasReservationFailure: Boolean(reservationFailureMessage),
      hasPlannerMessage: Boolean(plannerMessage),
    });
    this.logger.info('Birdwatching agent final prompt assembled', {
      conversationId: metadata.conversationId,
      finalMessageCount: finalMessages.length,
      hasToolContext: Boolean(toolContextMessage),
      hasKnownBookingContext: Boolean(knownBookingContextMessage),
      hasReservationFailure: Boolean(reservationFailureMessage),
      hasPlannerMessage: Boolean(plannerMessage),
    });

    this.logger.info('Birdwatching agent plan resolved', {
      conversationId: metadata.conversationId,
      status: plan.status,
      tools: metadata.agentPlan.tools,
      debugTrace,
    });

    recordTraceEvent(metadata, 'orchestration_stream_started', {
      finalMessageCount: finalMessages.length,
    });

    return this.aiClient.streamChatCompletion(finalMessages, {
      usage,
      onChunk,
      signal: options.signal,
    });
  }
}

export default new AgentOrchestrator();
