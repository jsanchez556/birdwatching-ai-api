import OpenAI from 'openai';
import { recommendationSchema } from './recommendation.schema.js';
import env from '../config/env.js';
import asyncRetry from '../utils/asyncRetry.js';
import logger from '../utils/logger.js';
import {
  RECOMMENDATION_PROMPT,
  RECOMMENDATION_PROMPT_VERSION,
} from './prompts/recommendation.prompt.js';

const retryableStatuses = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryableOpenAIError(error) {
  return retryableStatuses.has(error.status) || error.code === 'ETIMEDOUT';
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
