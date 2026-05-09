import OpenAI from 'openai';
import { recommendationSchema } from './schemas/recommendation.schema.js';
import env from '../config/env.js';
import asyncRetry from '../utils/asyncRetry.js';
import logger from '../utils/logger.js';
import { availableTools, executeToolCall } from './tools/index.js';
import {
  RECOMMENDATION_PROMPT,
  RECOMMENDATION_PROMPT_VERSION,
} from './prompts/recommendation.prompt.js';

const retryableStatuses = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryableOpenAIError(error) {
  return retryableStatuses.has(error.status) || error.code === 'ETIMEDOUT';
}

function appendToolMetadata(metadata, toolName, result) {
  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  metadata.toolsCalled = [...(metadata.toolsCalled || []), toolName];

  if (Array.isArray(result?.tours)) {
    metadata.tours = result.tours;
  }

  if (result?.selectedTour) {
    metadata.selectedTour = result.selectedTour;
    metadata.selectedTourId = result.selectedTour.tourId;
  }

  if (result?.reservation) {
    metadata.reservation = result.reservation;
  } else if (toolName === 'createReservation' && result?.success) {
    metadata.reservation = result;
  }
}

class OpenAIClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: env.openAiApiKey,
    });
    this.model = env.openAiModel;
    this.embeddingModel = env.openAiEmbeddingModel;
  }

  async createChatCompletion(messages) {
    const completion = await asyncRetry(() => this.client.chat.completions.create({
      model: this.model,
      messages,
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    });

    this.logCompletionUsage('chat_completion', completion);
    return completion.choices[0]?.message?.content;
  }

  async createChatCompletionWithTools(messages, options = {}) {
    const tools = options.tools || availableTools;
    const toolExecutor = options.executeToolCall || executeToolCall;
    const metadata = options.metadata || {};
    const maxToolIterations = options.maxToolIterations || 3;
    const conversation = [...messages];

    for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
      const completion = await asyncRetry(() => this.client.chat.completions.create({
        model: this.model,
        messages: conversation,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
      }), {
        retries: 2,
        shouldRetry: isRetryableOpenAIError,
      });

      this.logCompletionUsage('chat_completion_with_tools', completion, {
        toolIteration: iteration,
      });

      const assistantMessage = completion.choices[0]?.message;
      const toolCalls = assistantMessage?.tool_calls || [];

      if (toolCalls.length === 0) {
        return assistantMessage?.content;
      }

      conversation.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: toolCalls,
      });

      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
        const toolName = toolCall.function?.name;
        const args = this.parseToolArguments(toolCall);
        const result = await toolExecutor(toolName, args, metadata);
        appendToolMetadata(metadata, toolName, result);

        return {
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(result),
        };
      }));

      conversation.push(...toolResults);
    }

    logger.warn('OpenAI tool call loop reached iteration limit', {
      conversationId: metadata.conversationId,
      maxToolIterations,
    });

    const completion = await asyncRetry(() => this.client.chat.completions.create({
      model: this.model,
      messages: conversation,
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    });

    this.logCompletionUsage('chat_completion_after_tool_limit', completion);
    return completion.choices[0]?.message?.content;
  }

  async generateEmbedding(input) {
    const embeddingResponse = await asyncRetry(() => this.client.embeddings.create({
      model: this.embeddingModel,
      input,
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    });

    logger.info('OpenAI embeddings finished', {
      event: 'embeddings',
      model: embeddingResponse.model || this.embeddingModel,
      requestId: embeddingResponse.id,
      promptTokens: embeddingResponse.usage?.prompt_tokens,
      totalTokens: embeddingResponse.usage?.total_tokens,
      inputCount: Array.isArray(input) ? input.length : 1,
    });

    const embeddings = [...embeddingResponse.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (embeddings.length !== (Array.isArray(input) ? input.length : 1)) {
      throw new Error('OpenAI returned an unexpected number of embeddings');
    }

    return embeddings;
  }

  async createStructuredRecommendation(location, budget, days) {
    const userMessage = `Generate birdwatching recommendations for:
- Location: ${location}
- Budget: ${budget}
- Days: ${days}`;

    const completion = await asyncRetry(() => this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: RECOMMENDATION_PROMPT,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [
        {
          type: 'function',
          function: recommendationSchema,
        },
      ],
      tool_choice: { type: 'function', function: { name: 'get_bird_recommendation' } },
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    });

    this.logCompletionUsage('structured_recommendation', completion, {
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];

    if (toolCall) {
      try {
        return JSON.parse(toolCall.function.arguments);
      } catch (error) {
        logger.error('Failed to parse OpenAI recommendation tool response', {
          error: error.message,
          model: this.model,
        });
        return null;
      }
    }

    return null;
  }

  parseToolArguments(toolCall) {
    const rawArguments = toolCall.function?.arguments || '{}';

    try {
      return JSON.parse(rawArguments);
    } catch (error) {
      logger.warn('Failed to parse OpenAI tool call arguments', {
        toolName: toolCall.function?.name,
        error: error.message,
      });
      return {};
    }
  }

  logCompletionUsage(event, completion, metadata = {}) {
    logger.info('OpenAI completion finished', {
      event,
      model: completion.model || this.model,
      requestId: completion.id,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      ...metadata,
    });
  }
}

export default new OpenAIClient();
