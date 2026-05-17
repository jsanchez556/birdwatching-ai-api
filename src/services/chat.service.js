import { randomUUID } from 'crypto';
import openaiService from '../ai/openai.service.js';
import {
  applyChatOutputGuardrails,
  assessChatInput,
} from '../ai/guardrails/chat.guardrails.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from '../ai/prompts/system.prompt.js';
import conversationService from './conversation.service.js';
import ragService from './rag.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';

const STREAM_GUARDRAIL_BUFFER_CHARS = 48;

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

function buildToolMeta(metadata = {}) {
  return {
    ...buildPromptMeta(),
    ...(metadata.toolsCalled?.length ? { toolsCalled: metadata.toolsCalled } : {}),
    ...(metadata.tours ? { tours: metadata.tours } : {}),
    ...(metadata.selectedTour ? { selectedTour: metadata.selectedTour } : {}),
    ...(metadata.selectedTourId ? { selectedTourId: metadata.selectedTourId } : {}),
    ...(metadata.participants ? { participants: metadata.participants } : {}),
    ...(metadata.selectedTransportation ? { selectedTransportation: metadata.selectedTransportation } : {}),
    ...(metadata.transportationDeclined ? { transportationDeclined: metadata.transportationDeclined } : {}),
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.reservation ? { reservation: metadata.reservation } : {}),
    ...(metadata.uiAction ? { uiAction: metadata.uiAction } : {}),
    ...(metadata.customerContext ? { customerContext: metadata.customerContext } : {}),
  };
}

class ChatService {
  async processMessageStream(message, conversationId, clientIP, events = {}, options = {}) {
    const activeConversationId = conversationId?.trim() || randomUUID();
    const { signal } = options;

    logger.info('Streaming chat request received', {
      ip: clientIP,
      conversationId: activeConversationId,
      messageLength: message?.length,
    });

    if (!message) {
      logger.warn('Missing streaming chat message', { ip: clientIP });
      throw new HttpError(400, 'Message is required', { code: 'VALIDATION_ERROR' });
    }

    throwIfAborted(signal);

    const inputGuardrail = assessChatInput(message);

    if (!inputGuardrail.allowed) {
      logger.warn('Streaming chat input blocked by AI guardrail', {
        ip: clientIP,
        conversationId: activeConversationId,
        code: inputGuardrail.code,
        reason: inputGuardrail.reason,
      });

      await conversationService.saveExchange(
        activeConversationId,
        message,
        inputGuardrail.response
      );

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

    const conversationMessages = await conversationService.buildConversationContext(
      message,
      activeConversationId
    );

    throwIfAborted(signal);

    const ragContext = await ragService.buildContext(conversationMessages, message, {
      clientIP,
      conversationId: activeConversationId,
    });

    throwIfAborted(signal);

    const openAiMetadata = {
      clientIP,
      conversationId: activeConversationId,
      customerContext: options.customerContext,
      conversationContext: options.conversationContext,
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
    await conversationService.saveExchange(activeConversationId, message, finalResponse);

    return {
      conversationId: activeConversationId,
      response: finalResponse,
      sources: ragContext.sources,
      meta: buildToolMeta(openAiMetadata),
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

  async getConversationMessages(conversationId) {
    return conversationService.getConversationMessages(conversationId);
  }
}

export { buildPromptMeta, buildToolMeta };
export default new ChatService();
