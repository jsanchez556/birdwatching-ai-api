import openaiClient from './openai.client.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from './prompts/system.prompt.js';

class ChatCompletionService {
  async generateResponse(messages, metadata = {}) {
    const usage = {};
    const response = await openaiClient.createChatCompletion(messages, {
      metadata,
      usage,
    });
    return this.handleResponse(response, messages, metadata, usage);
  }

  async generateResponseWithTools(messages, metadata = {}) {
    const usage = {};
    const response = await openaiClient.createChatCompletionWithTools(messages, {
      metadata,
      usage,
    });

    return this.handleResponse(response, messages, metadata, usage);
  }

  handleResponse(response, messages, metadata = {}, usage = {}) {
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
      promptTokens: usage.openAiUsage?.promptTokens || 0,
      completionTokens: usage.openAiUsage?.completionTokens || 0,
      totalTokens: usage.openAiUsage?.totalTokens || 0,
      estimatedCostUsd: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostUsd
        : null,
      estimatedCost: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostDisplay
        : null,
    });

    logger.info('OpenAI token usage for conversation', {
      conversationId: metadata.conversationId,
      promptTokens: usage.openAiUsage?.promptTokens || 0,
      completionTokens: usage.openAiUsage?.completionTokens || 0,
      estimatedCost: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostDisplay
        : null,
    });

    return response;
  }
}

export default new ChatCompletionService();
