import openaiClient from '../clients/openai.client.js';
import birdwatchingAgent from '../agents/birdwatching.agent.js';
import logger from '../../utils/logger.js';
import {
  traceAgentOrchestration,
  traceAgentPlanning,
  traceContextAssembly,
} from '../../tracing/aiTracing.middleware.js';
import featureFlags from '../../featureFlags/featureFlag.service.js';
import { FEATURE_FLAGS } from '../../featureFlags/flags.js';
import experimentAssignmentService from '../../services/experimentAssignment.service.js';
import {
  TOUR_RECOMMENDATION_EXPERIMENT,
  normalizeTourRecommendationAssignment,
} from '../../experiments/tourRecommendation.experiment.js';
import { getTourRecommendationPrompt } from '../prompts/tourRecommendation.prompt.js';
import { routeModel } from '../routing/modelRouter.js';
import { classifyTask } from '../routing/taskClassifier.js';
import reservationIntentExtractor from '../services/reservationIntent.service.js';
import reservationStateService from '../../services/reservationState.service.js';
import { executeModelRoute } from '../utils/modelRouteExecution.utils.js';
import modelRoutingTelemetry from '../telemetry/modelRoutingTelemetry.js';
import contextBuilder from '../context/contextBuilder.js';
import { formatContextPackage } from '../context/contextFormatter.js';
import {
  UNAVAILABLE_CAPABILITIES,
  classifyCapabilityFailure,
  markCapabilityUnavailable,
} from '../../utils/degradation.utils.js';

const BOOKING_TOOLS = new Set([
  'createReservation',
]);
const BUSINESS_TOOLS = new Set([
  'searchTours',
  'calculateTransfer',
  'calculatePricing',
  'checkAvailability',
  'createReservation',
]);
const RESERVATION_LANGUAGE = /\b(book|booking|reserve|reservation|tour|availability|available|price|pricing|cost|transport|transfer|shuttle|pickup|participants?|people|persons?|adults?|children|actually|instead|clear|remove|forget)\b|\b\d{4}-\d{2}-\d{2}\b/i;

function safeJson(value) {
  return JSON.stringify(value, null, 2);
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
      'Do not discuss tours, pricing, transfer, reservations, booking steps, or customer-specific planning.',
      'If the user asks for restricted help, tell them to log in.',
    ].join('\n'),
  };
}

function buildReservationFailureMessage(toolResults = {}) {
  const failedReservation = (toolResults.errors || []).find((error) => error.tool === 'createReservation');

  if (!failedReservation) {
    return null;
  }

  const indeterminate = failedReservation.code === 'TOOL_RESULT_INDETERMINATE';

  return {
    role: 'system',
    content: indeterminate
      ? [
        'Reservation creation returned an indeterminate result.',
        'Do not say whether the reservation succeeded or failed.',
        'Tell the customer the reservation status must be verified before any new booking attempt. Do not ask them to retry the booking automatically.',
        failedReservation.message ? `Safe failure message: ${failedReservation.message}` : null,
      ].filter(Boolean).join('\n')
      : [
        'Reservation creation failed.',
        'The reservation was not saved in the database, so do not say it is confirmed.',
        'Apologize briefly, explain that the booking could not be completed right now, and ask the customer to try again or contact support.',
        failedReservation.message ? `Safe failure message: ${failedReservation.message}` : null,
      ].filter(Boolean).join('\n'),
  };
}

function markReservationDegraded(metadata, error, { record = true } = {}) {
  delete metadata.reservation;
  return markCapabilityUnavailable(
    metadata,
    UNAVAILABLE_CAPABILITIES.RESERVATION_TOOL,
    error,
    {
      context: {
        aiTraceId: metadata.aiTraceId,
        traceId: metadata.agentTraceId,
      },
      record,
    }
  );
}

function buildLimitedModelFallback(metadata = {}, toolResults = {}) {
  const reservationFailed = (toolResults.errors || [])
    .some((error) => error.tool === 'createReservation');

  if (reservationFailed) {
    return 'Booking cannot be completed right now, and no reservation has been confirmed. I can still help with the tour details already shown.';
  }
  if (Array.isArray(metadata.tours) && metadata.tours.length > 0) {
    return `I can still show the ${metadata.tours.length} available tour option${metadata.tours.length === 1 ? '' : 's'} returned by the tour search, but personalized AI recommendations are temporarily unavailable.`;
  }
  if (metadata.selectedTour || metadata.pricing) {
    return 'I can still show the verified tour and pricing details already retrieved, but personalized AI guidance is temporarily unavailable.';
  }

  return null;
}

function buildKnownBookingContextMessage(metadata = {}) {
  const recentMetadata = metadata.conversationContext?.recentAssistantMetadata || {};
  const knownContext = {
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
    ...(recentMetadata.reservationEntry ? { reservationEntry: recentMetadata.reservationEntry } : {}),
    ...(metadata.selectedTransfer ? { selectedTransfer: metadata.selectedTransfer } : {}),
    ...(metadata.transferDeclined ? { transferDeclined: metadata.transferDeclined } : {}),
    ...(metadata.requestedTransfer ? { requestedTransfer: metadata.requestedTransfer } : {}),
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

function requiresReservationIntentExtraction(message, plan = {}) {
  return RESERVATION_LANGUAGE.test(message)
    || (plan.steps || []).some((step) => BUSINESS_TOOLS.has(step.tool));
}

function isFinalConfirmationResponse(message, context = {}) {
  const action = context.recentMetadata?.uiAction;
  const offersConfirmation = action?.type === 'reservation_confirmation'
    && Array.isArray(action.options)
    && action.options.some((option) => option.value === 'confirm_reservation');
  return Boolean(
    offersConfirmation
      && /^(?:confirm|confirm reservation|yes|yeah|yep|ok|okay|sure|go ahead|proceed)$/i
        .test(message.trim())
  );
}

function buildExtractionFailurePlan(extraction) {
  const refused = extraction?.code === 'RESERVATION_INTENT_REFUSED';

  return {
    status: refused ? 'intent_extraction_refused' : 'intent_extraction_failed',
    steps: [],
    message: refused
      ? 'I could not safely interpret that booking request. Ask the user to rephrase it without executing any tour or reservation action.'
      : 'I could not validate the booking details. Ask the user to rephrase the request without executing any tour or reservation action.',
  };
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
    selectedTransfer: metadata.selectedTransfer || recentMetadata.selectedTransfer,
    transferDeclined: metadata.transferDeclined || recentMetadata.transferDeclined,
    requestedTransfer: metadata.requestedTransfer || recentMetadata.requestedTransfer,
    recentMetadata,
    recentTours,
    recentToolsCalled: recentMetadata.toolsCalled || [],
    reservation: metadata.reservation,
    customerContext: metadata.customerContext,
    reservationState: metadata.reservationState,
    messages,
  };
}

export class AgentOrchestrator {
  constructor({
    agent = birdwatchingAgent,
    aiClient = openaiClient,
    featureFlagService = featureFlags,
    experimentAssignments = experimentAssignmentService,
    modelRouter = routeModel,
    taskClassifier = classifyTask,
    intentExtractor = reservationIntentExtractor,
    stateService = reservationStateService,
    modelRouteExecutor = executeModelRoute,
    modelRouteTelemetry = modelRoutingTelemetry,
    log = logger,
  } = {}) {
    this.agent = agent;
    this.aiClient = aiClient;
    this.featureFlags = featureFlagService;
    this.experimentAssignments = experimentAssignments;
    this.modelRouter = modelRouter;
    this.taskClassifier = taskClassifier;
    this.intentExtractor = intentExtractor;
    this.stateService = stateService;
    this.modelRouteExecutor = modelRouteExecutor;
    this.modelRouteTelemetry = modelRouteTelemetry;
    this.logger = log;
  }

  finalizeModelRoutingTelemetry(execution, details) {
    try {
      return this.modelRouteTelemetry.finalize(execution, details);
    } catch {
      return null;
    }
  }

  async generateResponse(messages, metadata = {}, options = {}) {
    return traceAgentOrchestration('birdwatching_agent_generate_response', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      role: metadata.role,
      messageCount: messages.length,
      hasCustomerContext: Boolean(metadata.customerContext),
      hasConversationContext: Boolean(metadata.conversationContext),
      aiTraceId: metadata.aiTraceId,
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
      hasSelectedTransfer: Boolean(conversationContext.selectedTransfer),
      transferDeclined: Boolean(conversationContext.transferDeclined),
      recentToolCount: conversationContext.recentToolsCalled.length,
      aiTraceId: metadata.aiTraceId,
    });

    let plan = await traceAgentPlanning('birdwatching_agent_planner', {
      parentTraceId: metadata.agentTraceId,
      conversationId: metadata.conversationId,
      role: metadata.role,
      messageLength: userMessage.length,
      hasSelectedTour: Boolean(conversationContext.selectedTour || conversationContext.selectedTourId),
      hasSelectedTransfer: Boolean(conversationContext.selectedTransfer),
      transferDeclined: Boolean(conversationContext.transferDeclined),
      recentToolCount: conversationContext.recentToolsCalled.length,
    }, async () => (metadata.role === 'visitor'
      ? {
        status: 'visitor_bird_answer',
        steps: [],
        message: 'Answer the visitor question with bird information only. Do not offer tours, bookings, reservations, prices, or transfer.',
      }
      : this.agent.planner.plan({
        message: userMessage,
        context: conversationContext,
      })));

    if (metadata.role !== 'visitor' && requiresReservationIntentExtraction(userMessage, plan)) {
      const extraction = await this.intentExtractor.extract({
        message: userMessage,
        signal: options.signal,
        metadata: {
          agentTraceId: metadata.agentTraceId,
          parentTraceId: metadata.parentTraceId,
          conversationId: metadata.conversationId,
          usage,
        },
      });

      if (!extraction.success) {
        plan = buildExtractionFailurePlan(extraction);
        this.logger.warn('Reservation intent extraction blocked business tool planning', {
          conversationId: metadata.conversationId,
          code: extraction.code,
          reason: extraction.reason,
        });
      } else {
        const selectedStateTour = conversationContext.selectedTour || {};
        const stateExtraction = {
          ...extraction.data,
          tourId: extraction.data.tourId ?? selectedStateTour.tourId ?? conversationContext.selectedTourId ?? null,
          date: extraction.data.date ?? selectedStateTour.scheduledDate ?? null,
          participants: extraction.data.participants ?? conversationContext.participants ?? null,
          transferRequired: extraction.data.transferRequired
            ?? (conversationContext.selectedTransfer
              ? true
              : conversationContext.transferDeclined
                ? false
                : null),
          pickupLocation: extraction.data.pickupLocation
            ?? conversationContext.selectedTransfer?.origin
            ?? null,
        };
        let stateUpdate;
        try {
          stateUpdate = await this.stateService.processMessage({
            conversationId: metadata.conversationId,
            userId: metadata.userId,
            message: userMessage,
            extraction: stateExtraction,
            customerContext: metadata.customerContext,
            sourceId: metadata.aiTraceId || metadata.parentTraceId,
            confirm: isFinalConfirmationResponse(userMessage, conversationContext),
          });
          metadata.reservationState = stateUpdate.state;
          conversationContext.reservationState = stateUpdate.state;
        } catch (error) {
          stateUpdate = { success: false, code: 'RESERVATION_STATE_UNAVAILABLE' };
          this.logger.warn('Structured reservation state is unavailable', {
            code: error.code,
          });
        }

        if (!stateUpdate.success && stateUpdate.code === 'RESERVATION_STATE_CONFLICT') {
          plan = {
            status: 'reservation_state_conflict',
            steps: [],
            message: 'The booking details changed concurrently. Ask the user to retry so the latest reservation state can be loaded.',
          };
        } else if (
          extraction.data.intent === 'unknown'
          && stateUpdate.state?.status !== 'ready_for_confirmation'
        ) {
          plan = {
            status: 'intent_unknown',
            steps: [],
            message: 'The request is too ambiguous to identify a supported tour or reservation action. Ask a brief clarifying question without executing any business tool.',
          };
        } else {
          plan = await this.agent.planner.plan({
            message: userMessage,
            context: {
              ...conversationContext,
              reservationIntent: extraction.data,
            },
          });
        }
      }
    }

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
      let temporaryDisable;
      let bookingEnabled;

      try {
        temporaryDisable = await this.featureFlags.getTemporaryDisable?.(
          FEATURE_FLAGS.AGENT_BOOKING
        );
        bookingEnabled = temporaryDisable ? false : await this.featureFlags.isEnabled({
          flag: FEATURE_FLAGS.AGENT_BOOKING,
          userId: metadata.userId,
          anonymousId: metadata.conversationId,
          personProperties: {
            plan: metadata.authUser?.plan,
            role: metadata.role,
          },
        });
      } catch (error) {
        if (!classifyCapabilityFailure(error).recoverable) throw error;
        temporaryDisable = { error };
        bookingEnabled = false;
      }

      if (!bookingEnabled) {
        const unavailableMessage = 'Booking is temporarily unavailable, and no reservation has been confirmed. I can still help you discover tours and explain the booking steps.';
        markReservationDegraded(metadata, temporaryDisable?.error || {
          code: temporaryDisable ? 'CIRCUIT_OPEN' : 'SERVICE_UNAVAILABLE',
        });
        metadata.agentPlan = { status: 'booking_feature_unavailable', tools: [] };
        await onChunk(unavailableMessage);
        return unavailableMessage;
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

    if (plan.selectedTransfer || conversationContext.selectedTransfer) {
      metadata.selectedTransfer = plan.selectedTransfer
        || conversationContext.selectedTransfer;
    }

    if (plan.transferDeclined || conversationContext.transferDeclined) {
      metadata.transferDeclined = true;
    }

    if (plan.requestedTransfer || conversationContext.requestedTransfer) {
      metadata.requestedTransfer = true;
    }

    this.logger.info('Birdwatching agent tool execution starting', {
      conversationId: metadata.conversationId,
      status: plan.status,
      tools: metadata.agentPlan.tools,
    });

    const toolResults = await this.agent.executor.executePlan(plan, metadata);
    const failedReservation = (toolResults.errors || [])
      .find((error) => error.tool === 'createReservation');
    if (
      failedReservation
      && classifyCapabilityFailure(failedReservation).recoverable
    ) {
      markReservationDegraded(metadata, failedReservation, { record: false });
    }
    recordTraceEvent(metadata, 'orchestration_tools_completed', {
      status: plan.status,
      success: toolResults.success,
      executedStepCount: toolResults.steps?.length || 0,
      errorCount: toolResults.errors?.length || 0,
    });
    const debugTrace = attachDebugTraceSummary(metadata, plan, toolResults);
    const contextToolResults = [
      ...(Array.isArray(toolResults) ? toolResults : (toolResults.steps || [])),
      ...(Array.isArray(toolResults) ? [] : (toolResults.errors || [])).map((error) => ({
        tool: error.tool,
        status: 'failed',
        result: {
          status: error.code === 'TOOL_RESULT_INDETERMINATE' ? 'indeterminate' : 'failed',
          error: {
            code: error.code,
            message: error.message,
          },
        },
      })),
    ];
    const visitorScopeMessage = buildVisitorScopeMessage(metadata);
    const knownBookingContextMessage = buildKnownBookingContextMessage(metadata);
    const reservationFailureMessage = buildReservationFailureMessage(toolResults);
    const plannerMessage = buildPlannerMessage(plan);
    const tourRecommendationPromptMessage = buildTourRecommendationPromptMessage(metadata);
    const finalMessages = [
      ...messages,
      visitorScopeMessage,
      knownBookingContextMessage,
      reservationFailureMessage,
      tourRecommendationPromptMessage,
      plannerMessage,
    ].filter(Boolean);

    recordTraceEvent(metadata, 'orchestration_prompt_assembled', {
      finalMessageCount: finalMessages.length,
      hasToolContext: contextToolResults.length > 0,
      hasKnownBookingContext: Boolean(knownBookingContextMessage),
      hasReservationFailure: Boolean(reservationFailureMessage),
      hasTourRecommendationPrompt: Boolean(tourRecommendationPromptMessage),
      hasPlannerMessage: Boolean(plannerMessage),
    });
    this.logger.info('Birdwatching agent final prompt assembled', {
      conversationId: metadata.conversationId,
      finalMessageCount: finalMessages.length,
      hasToolContext: contextToolResults.length > 0,
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

    const routingTask = this.taskClassifier({
      operation: metadata.operation,
      hasRagContext: Number(metadata.ragTrace?.retrievedChunkCount || 0) > 0,
      plan,
    });
    const generationContext = await traceContextAssembly('chat_generation_context_assembly', {
      parentTraceId: metadata.agentTraceId || metadata.parentTraceId,
      requestCorrelationId: metadata.aiTraceId || metadata.parentTraceId,
      conversationId: metadata.conversationId,
      stage: 'generation',
      memoryEligible: metadata.userId !== undefined && metadata.userId !== null,
      ragEligible: true,
    }, () => contextBuilder.build({
      userId: metadata.userId ?? null,
      tenantId: metadata.tenantId ?? metadata.authUser?.tenantId ?? null,
      conversationId: metadata.conversationId,
      task: routingTask,
      stage: 'generation',
      userMessage,
      model: metadata.model || 'unrouted',
      providerMessages: finalMessages,
      toolResults: contextToolResults,
      signal: options.signal,
      parentTraceId: metadata.parentTraceId,
      excludedMemoryIds: metadata.excludedMemoryIds,
    }));
    const budgetedFinalMessages = formatContextPackage(generationContext);
    metadata.estimatedInputTokens = generationContext.estimatedTokens;
    metadata.contextMetrics = generationContext.metrics;
    metadata.contextProvenance = generationContext.traceProvenance;
    const modelRoute = this.modelRouter({
      task: routingTask,
      estimatedInputTokens: metadata.estimatedInputTokens,
      userPlan: metadata.authUser?.plan,
      complexity: metadata.complexity,
    });
    metadata.model = modelRoute.primaryModel.modelId;
    metadata.modelRouting = {
      task: modelRoute.task,
      route: modelRoute.route,
      primaryModelKey: modelRoute.primaryModel.key,
      fallbackModelKeys: modelRoute.fallbackModels.map((model) => model.key),
      reasoningEffort: modelRoute.reasoningEffort,
      reasonCode: modelRoute.reasonCode,
    };

    const finalGenerationMetadata = {
      ...metadata,
      finalPromptMessageCount: budgetedFinalMessages.length,
      groundingContext: metadata.ragTrace ? {
        retrievedChunkCount: metadata.ragTrace.retrievedChunkCount,
        sourceCount: metadata.ragTrace.sourceCount,
        contextMessageLength: metadata.ragTrace.contextMessageLength,
        retrievedChunks: metadata.ragTrace.retrievedChunks,
      } : undefined,
    };

    let routingTelemetryExecution;
    try {
      const response = await this.modelRouteExecutor({
        modelRoute,
        metadata,
        autoFinalizeTelemetry: false,
        onTelemetryExecution: (execution) => {
          routingTelemetryExecution = execution;
        },
        onChunk,
        signal: options.signal,
        executeAttempt: ({
          model,
          signal,
          timeoutMs,
          routePosition,
          attemptRole,
          sameModelAttempt,
          attemptContext,
          onChunk: attemptOnChunk,
        }) => this.aiClient.streamChatCompletion(budgetedFinalMessages, {
          usage,
          onChunk: attemptOnChunk,
          model: model.modelId,
          maxRetries: 0,
          timeoutMs,
          attemptContext,
          metadata: {
            ...finalGenerationMetadata,
            modelRouteAttempt: {
              modelKey: model.key,
              attemptRole,
              routePosition,
              sameModelAttempt,
            },
          },
          signal,
        }),
      });

      if (metadata.modelRouting?.usedFallback) {
        markCapabilityUnavailable(
          metadata,
          UNAVAILABLE_CAPABILITIES.ADVANCED_MODEL,
          { code: 'PRIMARY_MODEL_UNAVAILABLE' },
          {
            context: {
              aiTraceId: metadata.aiTraceId,
              traceId: metadata.agentTraceId,
            },
          }
        );
      }
      this.finalizeModelRoutingTelemetry(routingTelemetryExecution, {
        modelRoute,
        metadata,
        success: true,
        userVisibleSuccess: true,
        degradedMode: metadata.modelRouting?.usedFallback === true,
      });
      return response;
    } catch (error) {
      if (!classifyCapabilityFailure(error).recoverable) {
        this.finalizeModelRoutingTelemetry(routingTelemetryExecution, {
          modelRoute,
          metadata,
          success: false,
          userVisibleSuccess: false,
          degradedMode: false,
        });
        throw error;
      }
      const limitedFallback = buildLimitedModelFallback(metadata, toolResults);
      if (!limitedFallback) {
        this.finalizeModelRoutingTelemetry(routingTelemetryExecution, {
          modelRoute,
          metadata,
          success: false,
          userVisibleSuccess: false,
          degradedMode: false,
        });
        throw error;
      }

      markCapabilityUnavailable(
        metadata,
        UNAVAILABLE_CAPABILITIES.ADVANCED_MODEL,
        error,
        {
          context: {
            aiTraceId: metadata.aiTraceId,
            traceId: metadata.agentTraceId,
          },
        }
      );
      await onChunk(limitedFallback);
      this.finalizeModelRoutingTelemetry(routingTelemetryExecution, {
        modelRoute,
        metadata,
        success: true,
        userVisibleSuccess: true,
        degradedMode: true,
      });
      return limitedFallback;
    }
  }
}

export default new AgentOrchestrator();
