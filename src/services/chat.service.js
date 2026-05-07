import { randomUUID } from 'crypto';
import openaiService from '../ai/openai.service.js';
import conversationService from './conversation.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';

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

    const response = await openaiService.generateResponse(conversationMessages, {
      clientIP,
      conversationId: activeConversationId,
    });

    await conversationService.saveExchange(activeConversationId, message, response);

    return {
      conversationId: activeConversationId,
      response,
    };
  }

  async getConversationMessages(conversationId) {
    return conversationService.getConversationMessages(conversationId);
  }
}

export default new ChatService();
