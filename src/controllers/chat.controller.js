import chatService from '../services/chat.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

class ChatController {
  async handleChat(req, res) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const { message, conversationId } = req.body;
    logger.info('Chat request received', {
      ip: clientIP,
      conversationId,
      messageLength: message.length,
    });

    const result = await chatService.processMessage(message, conversationId, clientIP);
    return sendSuccess(res, {
      conversationId: result.conversationId,
      response: result.response,
      sources: result.sources || [],
    });
  }

  async handleGetConversation(req, res) {
    const { conversationId } = req.params;
    logger.info('Conversation load requested', { conversationId });

    const messages = await chatService.getConversationMessages(conversationId);
    return sendSuccess(res, { conversationId, messages });
  }
}

export default new ChatController();
