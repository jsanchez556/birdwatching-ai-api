import { randomUUID } from 'crypto';
import openaiService from '../ai/services/openai.service.js';
import {
  applyChatOutputGuardrails,
  assessChatInput,
} from '../ai/guardrails/chat.guardrails.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from '../ai/prompts/system.prompt.js';
import conversationService from './conversation.service.js';
import ragService from './rag.service.js';
import usageService from './usage.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import aiTelemetry from '../monitoring/aiTelemetry.js';
import {
  traceAiExecutionFlow,
  traceConversationContext,
} from '../tracing/aiTracing.middleware.js';
import { injectResponseModeMessage } from '../ai/prompts/prompt.builder.js';
import { FIELD_ASSISTANT_RESPONSE_MODE } from '../ai/prompts/system.prompt.js';
import analytics from '../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../analytics/events.js';
import env from '../config/env.js';

const STREAM_GUARDRAIL_BUFFER_CHARS = 48;
const VISITOR_ROLE = 'visitor';
const VISITOR_BLOCKED_RESPONSE = 'Visitor mode is limited to bird questions. Please log in to plan tours or make reservations.';
const VISITOR_NON_BIRD_RESPONSE = 'Visitor mode can only answer bird questions. Please ask about birds, habitats, behavior, or where birds can be seen.';
const VISITOR_BLOCKED_PATTERNS = [
  /\b(book|booking|reserve|reservation|confirm|availability|available slots?|participants?|guests?|price|pricing|cost|discount|transport|transportation|shuttle|transfer|pickup|tour|tours)\b/i,
];
const VISITOR_BIRD_PATTERNS = [
  /\b(bird|birds|birding|birdwatching|bird watching|species|habitats?|migration|nests?|nesting|feathers?|plumage|songs?|calls?|beaks?|raptors?|hummingbirds?|toucans?|quetzals?|macaws?|parrots?|motmots?|tanagers?|warblers?|flycatchers?|woodpeckers?|owls?|hawks?|falcons?|herons?|egrets?|kingfishers?|orioles?|guans?|curassows?|jacamars?|manakins?|antbirds?|wrens?|thrushes|finches|seedeaters?|euphonias?)\b/i,
];
const BIRD_DISCOVERY_PATTERNS = [
  /\b(bird|birds|birding|birdwatching|bird watching|species|habitats?|migration|nests?|nesting|feathers?|plumage|songs?|calls?|beaks?|raptors?|hummingbirds?|toucans?|quetzals?|macaws?|parrots?|motmots?|tanagers?|warblers?|flycatchers?|woodpeckers?|owls?|hawks?|falcons?|herons?|egrets?|kingfishers?|orioles?|guans?|curassows?|jacamars?|manakins?|antbirds?|wrens?|thrushes|finches|seedeaters?|euphonias?|ducks?|rails?|solitaires?|brushfinches?|tanagers?)\b/i,
];
const BOOKING_UI_ACTION_TYPES = new Set([
  'tour_selection',
  'participant_count',
  'choice',
  'transportation_selection',
  'reservation_confirmation',
]);
const BOOKING_TOOL_NAMES = new Set([
  'searchTours',
  'checkAvailability',
  'calculatePricing',
  'calculateTransportation',
  'createReservation',
]);

class StreamingGuardrailBlockedError extends Error {
  constructor(guardrail) {
    super('Streaming response blocked by output guardrail');
    this.name = 'StreamingGuardrailBlockedError';
    this.guardrail = guardrail;
  }
}

function createAbortError() {
  const error = new Error('Streaming request aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function buildPromptMeta() {
  return {
    promptVersions: {
      chat: CHAT_SYSTEM_PROMPT_VERSION,
    },
  };
}

function normalizeResponseMode(responseMode) {
  return responseMode === FIELD_ASSISTANT_RESPONSE_MODE ? responseMode : undefined;
}

function mergeAuthenticatedCustomerContext(customerContext, authUser = null) {
  if (!authUser) {
    return customerContext;
  }

  return {
    ...customerContext,
    customerName: authUser.name || customerContext?.customerName,
    customerEmail: authUser.email,
  };
}

function resolveRole(authUser) {
  if (authUser) {
    return authUser.role === 'admin' ? 'admin' : 'customer';
  }

  return VISITOR_ROLE;
}

function assertVisitorCanChat(message) {
  if (VISITOR_BLOCKED_PATTERNS.some((pattern) => pattern.test(message))) {
    throw new HttpError(403, VISITOR_BLOCKED_RESPONSE, { code: 'VISITOR_FORBIDDEN' });
  }

  if (!VISITOR_BIRD_PATTERNS.some((pattern) => pattern.test(message))) {
    throw new HttpError(403, VISITOR_NON_BIRD_RESPONSE, { code: 'VISITOR_TOPIC_RESTRICTED' });
  }
}

function isExplicitBirdDiscoveryRequest(message = '') {
  return BIRD_DISCOVERY_PATTERNS.some((pattern) => pattern.test(message));
}

function isExplicitBirdDiscoveryQuestion(message = '') {
  return (
    /\b(where|what|which|tell me|show me|find|see|common|about)\b/i.test(message)
    && isExplicitBirdDiscoveryRequest(message)
  );
}

function isBookingMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  if (BOOKING_UI_ACTION_TYPES.has(metadata.uiAction?.type)) {
    return true;
  }

  if (
    metadata.selectedTour
    || metadata.selectedTourId
    || metadata.selectedTransportation
    || metadata.transportationDeclined
    || metadata.requestedTransportation
    || metadata.participants
  ) {
    return true;
  }

  return Array.isArray(metadata.toolsCalled)
    && metadata.toolsCalled.some((toolName) => BOOKING_TOOL_NAMES.has(toolName));
}

function isBookingConversationContext(conversationContext = {}) {
  return isBookingMetadata(conversationContext?.recentAssistantMetadata);
}

function shouldIncludeBirdMatches(message, metadata = {}) {
  const isBookingTurn = isBookingConversationContext(metadata.conversationContext) || isBookingMetadata(metadata);

  if (isBookingTurn) {
    return isExplicitBirdDiscoveryQuestion(message);
  }

  return isExplicitBirdDiscoveryRequest(message);
}

function buildToolMeta(metadata = {}) {
  const recentMetadata = metadata.conversationContext?.recentAssistantMetadata || {};

  return {
    ...buildPromptMeta(),
    ...(metadata.responseMode ? { responseMode: metadata.responseMode } : {}),
    ...(recentMetadata.conversationType ? { conversationType: recentMetadata.conversationType } : {}),
    ...(recentMetadata.conversationSource ? { conversationSource: recentMetadata.conversationSource } : {}),
    ...(recentMetadata.entrySource ? { entrySource: recentMetadata.entrySource } : {}),
    ...(recentMetadata.reservationEntry ? { reservationEntry: recentMetadata.reservationEntry } : {}),
    ...(metadata.toolsCalled?.length ? { toolsCalled: metadata.toolsCalled } : {}),
    ...(metadata.tours ? { tours: metadata.tours } : {}),
    ...(metadata.requestedTransportation ? { requestedTransportation: metadata.requestedTransportation } : {}),
    ...(metadata.transportationDeclined ? { transportationDeclined: metadata.transportationDeclined } : {}),
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.uiAction ? { uiAction: metadata.uiAction } : {}),
  };
}

function buildConversationMeta(metadata = {}) {
  const recentMetadata = metadata.conversationContext?.recentAssistantMetadata || {};

  return {
    ...(recentMetadata.conversationType ? { conversationType: recentMetadata.conversationType } : {}),
    ...(recentMetadata.conversationSource ? { conversationSource: recentMetadata.conversationSource } : {}),
    ...(recentMetadata.entrySource ? { entrySource: recentMetadata.entrySource } : {}),
    ...(recentMetadata.reservationEntry ? { reservationEntry: recentMetadata.reservationEntry } : {}),
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
    ...(metadata.reservation ? { reservation: metadata.reservation } : {}),
    ...(metadata.selectedTour ? { selectedTour: metadata.selectedTour } : {}),
    ...(metadata.selectedTourId ? { selectedTourId: metadata.selectedTourId } : {}),
    ...(metadata.requestedTransportation ? { requestedTransportation: metadata.requestedTransportation } : {}),
    ...(metadata.selectedTransportation ? { selectedTransportation: metadata.selectedTransportation } : {}),
    ...(metadata.participants ? { participants: metadata.participants } : {}),
  };
}

function mergeChatMeta(messageMeta = {}, conversationMeta = {}) {
  return {
    ...messageMeta,
    ...conversationMeta,
  };
}

function resolveChatSource(options = {}) {
  if (options.source === 'voice' || options.source === 'text') {
    return options.source;
  }

  return normalizeResponseMode(options.responseMode) ? 'voice' : 'text';
}

class ChatService {
  async processMessageStream(message, conversationId, clientIP, events = {}, options = {}) {
    const activeConversationId = conversationId?.trim() || randomUUID();
    const role = resolveRole(options.authUser);

    return traceAiExecutionFlow('chat_stream_ai_execution_flow', {
      conversationId: activeConversationId,
      role,
      messageLength: message?.length || 0,
      hasAuthUser: Boolean(options.authUser),
      hasCustomerContext: Boolean(options.customerContext),
      hasConversationContext: Boolean(options.conversationContext),
      responseMode: normalizeResponseMode(options.responseMode),
      parentTraceId: options.parentTraceId,
    }, (trace) => this.processMessageStreamUntraced(
      message,
      activeConversationId,
      clientIP,
      events,
      {
        ...options,
        aiExecutionTraceId: trace.id,
        aiExecutionTrace: trace,
      }
    ));
  }

  async processMessageStreamUntraced(message, activeConversationId, clientIP, events = {}, options = {}) {
    const { signal, authUser } = options;
    const userId = authUser?.id;
    const role = resolveRole(authUser);
    const parentTraceId = options.aiExecutionTraceId;

    logger.info('Streaming chat request received', {
      ip: clientIP,
      conversationId: activeConversationId,
      messageLength: message?.length,
    });

    if (!message) {
      logger.warn('Missing streaming chat message', { ip: clientIP });
      throw new HttpError(400, 'Message is required', { code: 'VALIDATION_ERROR' });
    }

    const inputGuardrail = assessChatInput(message);

    if (!inputGuardrail.allowed) {
      logger.warn('Streaming chat input blocked by AI guardrail', {
        ip: clientIP,
        conversationId: activeConversationId,
        code: inputGuardrail.code,
        reason: inputGuardrail.reason,
      });

      if (userId === undefined || userId === null) {
        await conversationService.saveExchange(activeConversationId, message, inputGuardrail.response);
      } else {
        await conversationService.saveExchange(activeConversationId, message, inputGuardrail.response, { userId });
      }

      events.onStart?.({
        conversationId: activeConversationId,
        sources: [],
        meta: buildPromptMeta(),
      });
      events.onChunk?.(inputGuardrail.response);
      analytics.track({
        userId,
        anonymousId: `conversation:${activeConversationId}`,
        event: ANALYTICS_EVENTS.CHAT_MESSAGE_SENT,
        properties: {
          conversationId: activeConversationId,
          role,
          source: resolveChatSource(options),
        },
      });

      return {
        conversationId: activeConversationId,
        response: inputGuardrail.response,
        sources: [],
        meta: buildPromptMeta(),
      };
    }

    if (role === VISITOR_ROLE) {
      assertVisitorCanChat(message);
    }

    throwIfAborted(signal);
    await conversationService.assertCanAccess(activeConversationId, userId);

    const conversationMessages = await traceConversationContext('chat_conversation_context', {
      parentTraceId,
      conversationId: activeConversationId,
      role,
      hasUserId: userId !== undefined && userId !== null,
      messageLength: message.length,
    }, () => (userId === undefined || userId === null
      ? conversationService.buildConversationContext(message, activeConversationId)
      : conversationService.buildConversationContext(message, activeConversationId, { userId })));

    throwIfAborted(signal);

    const ragContext = await ragService.buildContext(conversationMessages, message, {
      clientIP,
      conversationId: activeConversationId,
      userId,
      role,
      ...(authUser ? { authUser } : {}),
      parentTraceId,
      source: resolveChatSource(options),
    });

    throwIfAborted(signal);

    const customerContext = mergeAuthenticatedCustomerContext(options.customerContext, authUser);
    const responseMode = normalizeResponseMode(options.responseMode);
    const promptMessages = responseMode
      ? injectResponseModeMessage(ragContext.messages, responseMode)
      : ragContext.messages;
    const openAiMetadata = {
      clientIP,
      conversationId: activeConversationId,
      role,
      ...(responseMode ? { responseMode } : {}),
      model: env.openAiModel,
      promptVersion: CHAT_SYSTEM_PROMPT_VERSION,
      source: resolveChatSource(options),
      ...(userId ? { userId } : {}),
      ...(authUser ? { authUser } : {}),
      ...(customerContext ? { customerContext } : {}),
      ...(options.conversationContext ? { conversationContext: options.conversationContext } : {}),
      ...(ragContext.ragTrace ? { ragTrace: ragContext.ragTrace } : {}),
      ...(parentTraceId ? { parentTraceId } : {}),
    };

    events.onStart?.({
      conversationId: activeConversationId,
      sources: ragContext.sources,
      meta: buildPromptMeta(),
    });

    const guardedEmitter = this.createGuardedEmitter({
      conversationId: activeConversationId,
      emitChunk: events.onChunk,
    });

    let response;

    try {
      response = await openaiService.streamResponseWithTools(promptMessages, openAiMetadata, {
        onChunk: guardedEmitter.push,
        signal,
      });
      throwIfAborted(signal);
      await guardedEmitter.flush();
    } catch (error) {
      if (!(error instanceof StreamingGuardrailBlockedError)) {
        throw error;
      }

      const replacement = error.guardrail.response;
      aiTelemetry.recordAiError('hallucination_event', {
        conversationId: activeConversationId,
        code: error.guardrail.code,
        reason: error.guardrail.reason,
        stage: 'streaming_output_guardrail',
      });
      aiTelemetry.recordAiError('invalid_output', {
        conversationId: activeConversationId,
        code: error.guardrail.code,
        stage: 'streaming_output_guardrail',
      });
      events.onReplace?.(replacement);
      response = replacement;
    }

    const outputGuardrail = applyChatOutputGuardrails(response);

    if (outputGuardrail.blocked) {
      aiTelemetry.recordAiError('hallucination_event', {
        conversationId: activeConversationId,
        code: outputGuardrail.code,
        reason: outputGuardrail.reason,
        stage: 'final_output_guardrail',
      });
      aiTelemetry.recordAiError('invalid_output', {
        conversationId: activeConversationId,
        code: outputGuardrail.code,
        stage: 'final_output_guardrail',
      });
      logger.warn('Streaming chat response replaced by AI guardrail', {
        ip: clientIP,
        conversationId: activeConversationId,
        code: outputGuardrail.code,
        reason: outputGuardrail.reason,
      });

      if (outputGuardrail.response !== response) {
        events.onReplace?.(outputGuardrail.response);
      }
    }

    const finalResponse = outputGuardrail.response;
    throwIfAborted(signal);
    const usageRecord = await usageService.recordOpenAiUsage(userId, openAiMetadata.openAiUsage, {
      usageEventId: options.usageEventId,
      traceId: options.aiExecutionTraceId,
    });

    if (usageRecord?.traceMetadata) {
      options.aiExecutionTrace?.annotate?.({
        billing: usageRecord.traceMetadata,
      });
    }

    const messageMeta = buildToolMeta(openAiMetadata);
    const conversationMeta = buildConversationMeta(openAiMetadata);
    const saveOptions = {
      ...(userId === undefined || userId === null ? {} : { userId }),
      ...(Object.keys(conversationMeta).length ? { metadata: conversationMeta } : {}),
    };

    if (Object.keys(saveOptions).length) {
      await conversationService.saveExchange(activeConversationId, message, finalResponse, saveOptions);
    } else {
      await conversationService.saveExchange(activeConversationId, message, finalResponse);
    }
    analytics.track({
      userId,
      anonymousId: `conversation:${activeConversationId}`,
      event: ANALYTICS_EVENTS.CHAT_MESSAGE_SENT,
      properties: {
        conversationId: activeConversationId,
        role,
        source: openAiMetadata.source,
      },
    });

    return {
      conversationId: activeConversationId,
      response: finalResponse,
      sources: ragContext.sources,
      meta: mergeChatMeta({
        ...messageMeta,
        ...(shouldIncludeBirdMatches(message, openAiMetadata) && ragContext.birdMatches?.length
          ? { birdMatches: ragContext.birdMatches }
          : {}),
      }, conversationMeta),
    };
  }

  createGuardedEmitter({ conversationId, emitChunk }) {
    let streamed = '';
    let pending = '';

    const emitSafePrefix = async () => {
      if (pending.length <= STREAM_GUARDRAIL_BUFFER_CHARS) {
        return;
      }

      const safePrefix = pending.slice(0, pending.length - STREAM_GUARDRAIL_BUFFER_CHARS);
      pending = pending.slice(-STREAM_GUARDRAIL_BUFFER_CHARS);
      streamed += safePrefix;
      await emitChunk?.(safePrefix);
    };

    return {
      push: async (chunk) => {
        pending += chunk;
        const guardrail = applyChatOutputGuardrails(streamed + pending);

        if (guardrail.blocked) {
          logger.warn('Streaming chat output blocked before unsafe chunk flush', {
            conversationId,
            code: guardrail.code,
            reason: guardrail.reason,
          });
          throw new StreamingGuardrailBlockedError(guardrail);
        }

        await emitSafePrefix();
      },
      flush: async () => {
        if (!pending) {
          return;
        }

        streamed += pending;
        await emitChunk?.(pending);
        pending = '';
      },
    };
  }

  async getLatestConversation(authUser) {
    return conversationService.getLatestConversationForUser(authUser?.id);
  }

  async getConversation(conversationId, authUser) {
    return conversationService.getConversationForUser(conversationId, authUser?.id);
  }
}

export {
  buildConversationMeta,
  buildPromptMeta,
  buildToolMeta,
  mergeAuthenticatedCustomerContext,
  normalizeResponseMode,
  resolveChatSource,
};
export default new ChatService();
