import { randomUUID } from 'crypto';
import openaiService from '../ai/openai.service.js';
import conversationService from './conversation.service.js';
import ragService from './rag.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';

function buildToolMeta(metadata = {}) {
  return {
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

    await conversationService.saveExchange(activeConversationId, message, response);

    return {
      conversationId: activeConversationId,
      response,
      sources: ragContext.sources,
      meta: buildToolMeta(openAiMetadata),
    };
  }

  async getConversationMessages(conversationId) {
    return conversationService.getConversationMessages(conversationId);
  }
}

export { buildToolMeta };
export default new ChatService();
