import openaiClient from './openai.client.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from './prompts/system.prompt.js';

class ChatCompletionService {
  async generateResponse(messages, metadata = {}) {
    const response = await openaiClient.createChatCompletion(messages);
    return this.handleResponse(response, messages, metadata);
  }

  async generateResponseWithTools(messages, metadata = {}) {
    const response = await openaiClient.createChatCompletionWithTools(messages, {
      metadata,
    });

    return this.handleResponse(response, messages, metadata);
  }

  handleResponse(response, messages, metadata = {}) {
    if (!response) {
      logger.error('No response from OpenAI', {
        ip: metadata.clientIP,
        conversationId: metadata.conversationId,
      });
      throw new HttpError(502, 'No response from AI provider', { code: 'AI_EMPTY_RESPONSE' });
    }

    logger.info('Chat response generated', {
      ip: metadata.clientIP,
      conversationId: metadata.conversationId,
      promptVersion: CHAT_SYSTEM_PROMPT_VERSION,
      promptMessageCount: messages.length,
      responseLength: response.length,
    });

    return response;
  }
}

export default new ChatCompletionService();
