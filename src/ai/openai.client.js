import OpenAI from 'openai';
import env from '../config/env.js';
import { asyncRetry } from '../utils/async.utils.js';
import logger from '../utils/logger.js';
import { availableTools, executeToolCall } from './tools/index.js';
import { addCompletionUsage } from './evaluations/token.usage.js';
import { traceLlmCall } from '../tracing/aiTracing.middleware.js';
import aiTelemetry from '../monitoring/aiTelemetry.js';

const retryableStatuses = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryableOpenAIError(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return false;
  }

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

  async resolveChatToolCalls(messages, options = {}) {
    const tools = options.tools || availableTools;
    const toolExecutor = options.executeToolCall || executeToolCall;
    const metadata = options.metadata || {};
    const usage = options.usage || {};
    const signal = options.signal;
    const maxToolIterations = options.maxToolIterations || 3;
    const conversation = [...messages];

    for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
      const completion = await traceLlmCall('chat_completion_tool_resolution', {
        parentTraceId: metadata.agentTraceId || metadata.parentTraceId,
        conversationId: metadata.conversationId,
        model: this.model,
        toolIteration: iteration,
        messageCount: conversation.length,
        toolCount: tools.length,
      }, () => asyncRetry(() => this.client.chat.completions.create({
        model: this.model,
        messages: conversation,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
      }, { signal }), {
        retries: 2,
        shouldRetry: isRetryableOpenAIError,
      }), {
        outputMetadata: (result) => ({
          requestId: result.id,
          model: result.model || this.model,
          toolCallCount: result.choices[0]?.message?.tool_calls?.length || 0,
        }),
      });

      this.logCompletionUsage('chat_completion_stream_tool_resolution', completion, {
        toolIteration: iteration,
      }, usage);

      const assistantMessage = completion.choices[0]?.message;
      const toolCalls = assistantMessage?.tool_calls || [];

      if (toolCalls.length === 0) {
        return conversation;
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

    logger.warn('OpenAI streaming tool resolution reached iteration limit', {
      conversationId: metadata.conversationId,
      maxToolIterations,
    });

    return conversation;
  }

  async streamChatCompletion(messages, options = {}) {
    const usage = options.usage || {};
    const onChunk = options.onChunk || (() => {});
    const signal = options.signal;
    let response = '';
    let streamModel = this.model;
    let streamId;

    return traceLlmCall('chat_completion_stream', {
      parentTraceId: options.metadata?.agentTraceId || options.metadata?.parentTraceId,
      conversationId: options.metadata?.conversationId,
      model: this.model,
      messageCount: messages.length,
      finalPromptMessageCount: options.metadata?.finalPromptMessageCount,
      groundingContext: options.metadata?.groundingContext,
    }, async (trace) => {
      const stream = await asyncRetry(() => this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }, { signal }), {
        retries: 2,
        shouldRetry: isRetryableOpenAIError,
      });

      for await (const chunk of stream) {
        streamId ||= chunk.id;
        streamModel = chunk.model || streamModel;

        if (chunk.usage) {
          trace.recordTokenUsage(chunk.usage);
          this.logCompletionUsage('chat_completion_stream', {
            id: streamId,
            model: streamModel,
            usage: chunk.usage,
          }, {}, usage);
        }

        const content = chunk.choices?.[0]?.delta?.content;

        if (content) {
          response += content;
          await onChunk(content);
        }
      }

      return response;
    }, {
      tokenUsage: null,
      outputMetadata: () => ({
        requestId: streamId,
        model: streamModel,
        responseLength: response.length,
      }),
    });
  }

  async streamChatCompletionWithTools(messages, options = {}) {
    const conversation = await this.resolveChatToolCalls(messages, options);
    return this.streamChatCompletion(conversation, options);
  }

  async generateEmbedding(input) {
    const inputCount = Array.isArray(input) ? input.length : 1;
    const embeddingResponse = await traceLlmCall('embedding_generation', {
      model: this.embeddingModel,
      inputCount,
    }, () => asyncRetry(() => this.client.embeddings.create({
      model: this.embeddingModel,
      input,
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      outputMetadata: (result) => ({
        requestId: result.id,
        model: result.model || this.embeddingModel,
        inputCount,
      }),
    });

    logger.info('OpenAI embeddings finished', {
      event: 'embeddings',
      model: embeddingResponse.model || this.embeddingModel,
      requestId: embeddingResponse.id,
      promptTokens: embeddingResponse.usage?.prompt_tokens,
      totalTokens: embeddingResponse.usage?.total_tokens,
      inputCount,
    });

    const embeddings = [...embeddingResponse.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (embeddings.length !== inputCount) {
      throw new Error('OpenAI returned an unexpected number of embeddings');
    }

    return embeddings;
  }

  parseToolArguments(toolCall) {
    const rawArguments = toolCall.function?.arguments || '{}';

    try {
      return JSON.parse(rawArguments);
    } catch (error) {
      aiTelemetry.recordAiError('invalid_json_output', {
        toolName: toolCall.function?.name,
        rawArgumentLength: rawArguments.length,
        error: {
          name: error.name,
          message: error.message,
        },
      });
      logger.warn('Failed to parse OpenAI tool call arguments', {
        toolName: toolCall.function?.name,
        error: error.message,
      });
      return {};
    }
  }

  logCompletionUsage(event, completion, logMetadata = {}, usageCollector = null) {
    const usage = addCompletionUsage(usageCollector, completion, this.model);

    logger.info('OpenAI completion finished', {
      event,
      model: completion.model || this.model,
      requestId: completion.id,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      estimatedCost: usage.estimatedCostDisplay,
      ...logMetadata,
    });
  }
}

export default new OpenAIClient();
