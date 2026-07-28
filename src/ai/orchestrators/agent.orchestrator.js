import openaiClient from '../clients/openai.client.js';
import birdwatchingAgent from '../agents/birdwatching.agent.js';
import logger from '../../utils/logger.js';
import {
  traceAgentOrchestration,
  traceAgentPlanning,
} from '../../tracing/aiTracing.middleware.js';
import featureFlags from '../../featureFlags/featureFlag.service.js';
import { FEATURE_FLAGS } from '../../featureFlags/flags.js';
import experimentAssignmentService from '../../services/experimentAssignment.service.js';
import {
  TOUR_RECOMMENDATION_EXPERIMENT,
  normalizeTourRecommendationAssignment,
} from '../../experiments/tourRecommendation.experiment.js';
import { getTourRecommendationPrompt } from '../prompts/tourRecommendation.prompt.js';

const BOOKING_TOOLS = new Set([
  'createReservation',
]);

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

function buildTourRecommendationPromptMessage(metadata = {}) {
  const version = metadata.activeTourRecommendationPromptVersion;

  if (!version) {
    return null;
  }

  return {
    role: 'system',
    content: getTourRecommendationPrompt(version),
  };
}

function hasRecommendationStep(plan = {}) {
  return (plan.steps || []).some((step) => (
    step.tool === 'searchTours'
    && step.args?.recommend === true
  ));
}

function hasRecommendationOutcomeStep(plan = {}) {
  return (plan.steps || []).some((step) => (
    step.tool === 'checkAvailability'
    || step.tool === 'createReservation'
  ));
}

function attachTourRecommendationAssignment(metadata, assignment, { activePrompt = false } = {}) {
  if (!assignment) return;

  metadata.experimentAssignments = {
    ...(metadata.experimentAssignments || {}),
    [TOUR_RECOMMENDATION_EXPERIMENT.metadataKey]: assignment,
  };
  metadata.experiment = assignment.experiment;
  metadata.experimentVariant = assignment.variant;

  if (activePrompt) {
    metadata.activeTourRecommendationPromptVersion = assignment.variant;
    metadata.promptVersion = assignment.variant;
    metadata.promptVersions = {
      ...(metadata.promptVersions || {}),
      tourRecommendation: assignment.variant,
    };
  }
}

function buildVisitorScopeMessage(metadata = {}) {
  if (metadata.role !== 'visitor') {
    return null;
  }

  return {
    role: 'system',
    content: [
      'The current user is an unauthenticated visitor.',
      'Answer only bird-related questions.',
      'Do not discuss tours, pricing, transportation, reservations, booking steps, or customer-specific planning.',
      'If the user asks for restricted help, tell them to log in.',
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
  const recentMetadata = metadata.conversationContext?.recentAssistantMetadata || {};
  const knownContext = {
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
    ...(recentMetadata.reservationEntry ? { reservationEntry: recentMetadata.reservationEntry } : {}),
    ...(metadata.selectedTransportation ? { selectedTransportation: metadata.selectedTransportation } : {}),
    ...(metadata.transportationDeclined ? { transportationDeclined: metadata.transportationDeclined } : {}),
    ...(metadata.requestedTransportation ? { requestedTransportation: metadata.requestedTransportation } : {}),
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
  const entryTours = Array.isArray(recentMetadata.reservationEntry?.tours)
    ? recentMetadata.reservationEntry.tours
    : [];
  const recentTours = recentMetadata.tours || entryTours;
  const singleEntryTour = entryTours.length === 1 ? entryTours[0] : null;

  return {
    selectedTour: metadata.selectedTour || recentMetadata.selectedTour || singleEntryTour,
    selectedTourId: metadata.selectedTourId || recentMetadata.selectedTourId || singleEntryTour?.tourId,
    participants: metadata.participants || recentMetadata.participants || singleEntryTour?.participants,
    selectedTransportation: metadata.selectedTransportation || recentMetadata.selectedTransportation,
    transportationDeclined: metadata.transportationDeclined || recentMetadata.transportationDeclined,
    requestedTransportation: metadata.requestedTransportation || recentMetadata.requestedTransportation,
    recentMetadata,
    recentTours,
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
    featureFlagService = featureFlags,
    experimentAssignments = experimentAssignmentService,
    log = logger,
  } = {}) {
    this.agent = agent;
    this.aiClient = aiClient;
    this.featureFlags = featureFlagService;
    this.experimentAssignments = experimentAssignments;
    this.logger = log;
  }

  async generateResponse(messages, metadata = {}, options = {}) {
    return traceAgentOrchestration('birdwatching_agent_generate_response', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      role: metadata.role,
      messageCount: messages.length,
      hasCustomerContext: Boolean(metadata.customerContext),
      hasConversationContext: Boolean(metadata.conversationContext),
    }, (trace) => {
      metadata.agentTraceId = trace.id;
      return this.generateResponseUntraced(messages, metadata, options);
    });
  }

  async generateResponseUntraced(messages, metadata = {}, options = {}) {
    const usage = options.usage || {};
    const onChunk = options.onChunk || (() => {});
    const userMessage = getLatestUserMessage(messages);
    const conversationContext = buildConversationContext(messages, metadata);
    let activeExperimentAssignment = normalizeTourRecommendationAssignment(
      metadata.conversationContext?.recentAssistantMetadata
    );

    attachTourRecommendationAssignment(metadata, activeExperimentAssignment);

    this.logger.info('Birdwatching agent orchestration started', {
      conversationId: metadata.conversationId,
      messageCount: messages.length,
      hasSelectedTour: Boolean(conversationContext.selectedTour || conversationContext.selectedTourId),
      hasSelectedTransportation: Boolean(conversationContext.selectedTransportation),
      transportationDeclined: Boolean(conversationContext.transportationDeclined),
      recentToolCount: conversationContext.recentToolsCalled.length,
    });

    let plan = await traceAgentPlanning('birdwatching_agent_planner', {
      parentTraceId: metadata.agentTraceId,
      conversationId: metadata.conversationId,
      role: metadata.role,
      messageLength: userMessage.length,
      hasSelectedTour: Boolean(conversationContext.selectedTour || conversationContext.selectedTourId),
      hasSelectedTransportation: Boolean(conversationContext.selectedTransportation),
      transportationDeclined: Boolean(conversationContext.transportationDeclined),
      recentToolCount: conversationContext.recentToolsCalled.length,
    }, async () => (metadata.role === 'visitor'
      ? {
        status: 'visitor_bird_answer',
        steps: [],
        message: 'Answer the visitor question with bird information only. Do not offer tours, bookings, reservations, prices, or transportation.',
      }
      : this.agent.planner.plan({
        message: userMessage,
        context: conversationContext,
      })));

    if (hasRecommendationStep(plan)) {
      activeExperimentAssignment = activeExperimentAssignment || await this.experimentAssignments.resolve({
        userId: metadata.userId,
        anonymousId: metadata.conversationId,
        experiment: TOUR_RECOMMENDATION_EXPERIMENT.key,
        flag: TOUR_RECOMMENDATION_EXPERIMENT.flag,
        variants: TOUR_RECOMMENDATION_EXPERIMENT.variants,
        defaultVariant: TOUR_RECOMMENDATION_EXPERIMENT.defaultVariant,
        personProperties: {
          plan: metadata.authUser?.plan,
          role: metadata.role,
        },
      });

      attachTourRecommendationAssignment(metadata, activeExperimentAssignment, {
        activePrompt: true,
      });
    } else if (!activeExperimentAssignment && hasRecommendationOutcomeStep(plan)) {
      activeExperimentAssignment = await this.experimentAssignments.getPersisted({
        userId: metadata.userId,
        experiment: TOUR_RECOMMENDATION_EXPERIMENT.key,
        variants: TOUR_RECOMMENDATION_EXPERIMENT.variants,
      });
      attachTourRecommendationAssignment(metadata, activeExperimentAssignment);
    }

    const hasBookingSteps = (plan.steps || []).some((step) => BOOKING_TOOLS.has(step.tool));

    if (hasBookingSteps) {
      const bookingEnabled = await this.featureFlags.isEnabled({
        flag: FEATURE_FLAGS.AGENT_BOOKING,
        userId: metadata.userId,
        anonymousId: metadata.conversationId,
        personProperties: {
          plan: metadata.authUser?.plan,
          role: metadata.role,
        },
      });

      if (!bookingEnabled) {
        plan = {
          status: 'booking_feature_unavailable',
          steps: [],
          message: 'Tour booking is temporarily unavailable. Explain this briefly and do not attempt booking tools.',
        };
      }
    }

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

    if (plan.requestedTransportation || conversationContext.requestedTransportation) {
      metadata.requestedTransportation = true;
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
    const visitorScopeMessage = buildVisitorScopeMessage(metadata);
    const knownBookingContextMessage = buildKnownBookingContextMessage(metadata);
    const reservationFailureMessage = buildReservationFailureMessage(toolResults);
    const plannerMessage = buildPlannerMessage(plan);
    const tourRecommendationPromptMessage = buildTourRecommendationPromptMessage(metadata);
    const finalMessages = [
      ...messages,
      visitorScopeMessage,
      toolContextMessage,
      knownBookingContextMessage,
      reservationFailureMessage,
      tourRecommendationPromptMessage,
      plannerMessage,
    ].filter(Boolean);

    recordTraceEvent(metadata, 'orchestration_prompt_assembled', {
      finalMessageCount: finalMessages.length,
      hasToolContext: Boolean(toolContextMessage),
      hasKnownBookingContext: Boolean(knownBookingContextMessage),
      hasReservationFailure: Boolean(reservationFailureMessage),
      hasTourRecommendationPrompt: Boolean(tourRecommendationPromptMessage),
      hasPlannerMessage: Boolean(plannerMessage),
    });
    this.logger.info('Birdwatching agent final prompt assembled', {
      conversationId: metadata.conversationId,
      finalMessageCount: finalMessages.length,
      hasToolContext: Boolean(toolContextMessage),
      hasKnownBookingContext: Boolean(knownBookingContextMessage),
      hasReservationFailure: Boolean(reservationFailureMessage),
      hasTourRecommendationPrompt: Boolean(tourRecommendationPromptMessage),
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
      metadata: {
        ...metadata,
        finalPromptMessageCount: finalMessages.length,
        groundingContext: metadata.ragTrace ? {
          retrievedChunkCount: metadata.ragTrace.retrievedChunkCount,
          sourceCount: metadata.ragTrace.sourceCount,
          contextMessageLength: metadata.ragTrace.contextMessageLength,
          retrievedChunks: metadata.ragTrace.retrievedChunks,
        } : undefined,
      },
      signal: options.signal,
    });
  }
}

export default new AgentOrchestrator();
