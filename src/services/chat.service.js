import { randomUUID } from 'crypto';
import openaiService from '../ai/openai.service.js';
import conversationService from './conversation.service.js';
import ragService from './rag.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from '../ai/prompts/system.prompt.js';
import {
  applyChatOutputGuardrails,
  assessChatInput,
} from '../ai/guardrails/chat.guardrails.js';

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
    ...(metadata.reservation ? { reservation: metadata.reservation } : {}),
  };
}

class ChatService {
  async processMessage(message, conversationId, clientIP) {
    const activeConversationId = conversationId?.trim() || randomUUID();

    logger.info('Processing chat message', {
      ip: clientIP,
      conversationId: activeConversationId,
      messageLength: message?.length,
    });

    if (!message) {
      logger.warn('Missing message', { ip: clientIP });
      throw new HttpError(400, 'Message is required', { code: 'VALIDATION_ERROR' });
    }

    const inputGuardrail = assessChatInput(message);

    if (!inputGuardrail.allowed) {
      logger.warn('Chat input blocked by AI guardrail', {
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

      return {
        conversationId: activeConversationId,
        response: inputGuardrail.response,
        sources: [],
        meta: buildToolMeta(),
      };
    }

    const conversationMessages = await conversationService.buildConversationContext(
      message,
      activeConversationId
    );

    const ragContext = await ragService.buildContext(conversationMessages, message, {
      clientIP,
      conversationId: activeConversationId,
    });

    const openAiMetadata = {
      clientIP,
      conversationId: activeConversationId,
    };

    const response = await openaiService.generateResponseWithTools(ragContext.messages, openAiMetadata);
    const outputGuardrail = applyChatOutputGuardrails(response);

    if (outputGuardrail.blocked) {
      logger.warn('Chat response replaced by AI guardrail', {
        ip: clientIP,
        conversationId: activeConversationId,
        code: outputGuardrail.code,
        reason: outputGuardrail.reason,
      });
    }

    await conversationService.saveExchange(activeConversationId, message, outputGuardrail.response);

    return {
      conversationId: activeConversationId,
      response: outputGuardrail.response,
      sources: ragContext.sources,
      meta: buildToolMeta(openAiMetadata),
    };
  }

  async getConversationMessages(conversationId) {
    return conversationService.getConversationMessages(conversationId);
  }
}

export { buildPromptMeta, buildToolMeta };
export default new ChatService();
