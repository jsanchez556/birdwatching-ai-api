import { randomUUID } from 'crypto';
import openaiService from '../ai/openai.service.js';
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

function buildToolMeta(metadata = {}) {
  return {
    ...buildPromptMeta(),
    ...(metadata.toolsCalled?.length ? { toolsCalled: metadata.toolsCalled } : {}),
    ...(metadata.tours ? { tours: metadata.tours } : {}),
    ...(metadata.transportationDeclined ? { transportationDeclined: metadata.transportationDeclined } : {}),
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.uiAction ? { uiAction: metadata.uiAction } : {}),
  };
}

function buildConversationMeta(metadata = {}) {
  return {
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
    ...(metadata.reservation ? { reservation: metadata.reservation } : {}),
    ...(metadata.selectedTour ? { selectedTour: metadata.selectedTour } : {}),
    ...(metadata.selectedTourId ? { selectedTourId: metadata.selectedTourId } : {}),
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

class ChatService {
  async processMessageStream(message, conversationId, clientIP, events = {}, options = {}) {
    const activeConversationId = conversationId?.trim() || randomUUID();
    const { signal, authUser } = options;
    const userId = authUser?.id;
    const role = resolveRole(authUser);

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

    const conversationMessages = userId === undefined || userId === null
      ? await conversationService.buildConversationContext(message, activeConversationId)
      : await conversationService.buildConversationContext(message, activeConversationId, { userId });

    throwIfAborted(signal);

    const ragContext = await ragService.buildContext(conversationMessages, message, {
      clientIP,
      conversationId: activeConversationId,
    });

    throwIfAborted(signal);

    const customerContext = mergeAuthenticatedCustomerContext(options.customerContext, authUser);
    const openAiMetadata = {
      clientIP,
      conversationId: activeConversationId,
      role,
      ...(userId ? { userId } : {}),
      ...(authUser ? { authUser } : {}),
      ...(customerContext ? { customerContext } : {}),
      ...(options.conversationContext ? { conversationContext: options.conversationContext } : {}),
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
      response = await openaiService.streamResponseWithTools(ragContext.messages, openAiMetadata, {
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
      events.onReplace?.(replacement);
      response = replacement;
    }

    const outputGuardrail = applyChatOutputGuardrails(response);

    if (outputGuardrail.blocked) {
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
    await usageService.recordOpenAiUsage(userId, openAiMetadata.openAiUsage);
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

    return {
      conversationId: activeConversationId,
      response: finalResponse,
      sources: ragContext.sources,
      meta: mergeChatMeta(messageMeta, conversationMeta),
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
}

export {
  buildConversationMeta,
  buildPromptMeta,
  buildToolMeta,
  mergeAuthenticatedCustomerContext,
};
export default new ChatService();
