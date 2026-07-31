import openaiClient from '../clients/openai.client.js';
import {
  CONVERSATION_SUMMARY_PROMPT_VERSION,
  CONVERSATION_SUMMARY_SYSTEM_PROMPT,
} from '../prompts/conversationSummary.prompt.js';
import { ConversationSummarySchema } from '../schemas/conversationSummary.schema.js';
import { getModel, MODEL_KEYS, MODEL_REGISTRY } from '../routing/modelRegistry.js';
import logger from '../../utils/logger.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import { classifyOpenAIError } from '../utils/openaiRetry.utils.js';
import { validateStructuredConversationSummary } from './summaryValidator.js';

const MAX_SUMMARY_ATTEMPTS = 2;

function buildSummaryInput({ previousSummary, previousSummaryVersion, messages, structuredState }) {
  return JSON.stringify({
    previousSummary: previousSummary || null,
    previousSummaryVersion: previousSummaryVersion ?? null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
    structuredState: structuredState || {},
  });
}

class ConversationSummaryService {
  constructor({
    client = openaiClient,
    log = logger,
    model = getModel(MODEL_REGISTRY, MODEL_KEYS.STRUCTURED_RELIABLE).modelId,
  } = {}) {
    this.client = client;
    this.logger = log;
    this.model = model;
  }

  async summarize({
    conversationId,
    previousSummary = null,
    previousSummaryVersion = null,
    messages = [],
    structuredState = {},
    signal,
    usage,
    parentTraceId,
  } = {}) {
    const sourceMessageIds = messages.map((message) => message.id);

    for (let attempt = 1; attempt <= MAX_SUMMARY_ATTEMPTS; attempt += 1) {
      try {
        const completion = await this.client.parseStructuredChatCompletion([
          { role: 'system', content: CONVERSATION_SUMMARY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildSummaryInput({
              previousSummary,
              previousSummaryVersion,
              messages,
              structuredState,
            }),
          },
        ], {
          schema: ConversationSummarySchema,
          schemaName: 'conversation_summary',
          model: this.model,
          signal,
          usage,
          metadata: {
            parentTraceId,
            conversationId,
            promptVersion: CONVERSATION_SUMMARY_PROMPT_VERSION,
            operation: 'conversation_compaction',
          },
        });
        const responseMessage = completion.choices?.[0]?.message;

        if (responseMessage?.refusal !== undefined && responseMessage?.refusal !== null) {
          return {
            success: false,
            code: 'CONVERSATION_SUMMARY_REFUSED',
            reason: 'model_refusal',
          };
        }

        const validation = validateStructuredConversationSummary(responseMessage?.parsed, {
          previousSummary,
          previousSummaryVersion,
          sourceMessageIds,
        });
        if (validation.success) return validation;

        this.logger.warn('Conversation compaction returned invalid structured output', {
          model: completion.model || this.model,
          requestId: completion.id,
          attempt,
          reason: validation.reason,
        });
        if (attempt === MAX_SUMMARY_ATTEMPTS) return validation;

        aiTelemetry.recordAiRetry({
          operation: 'conversation_summary_schema_correction',
          category: 'invalid_schema',
          retryKind: 'corrective',
          attempt,
          maximumRetryCount: 1,
          delayMs: 0,
        });
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;

        const classification = classifyOpenAIError(error);
        this.logger.warn('Conversation compaction structured parsing failed', {
          model: this.model,
          attempt,
          errorCategory: classification.category,
        });
        if (classification.retryKind !== 'corrective' || attempt === MAX_SUMMARY_ATTEMPTS) {
          return {
            success: false,
            code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
            reason: 'structured_parse_failed',
          };
        }

        aiTelemetry.recordAiRetry({
          operation: 'conversation_summary_schema_correction',
          category: classification.category,
          retryKind: classification.retryKind,
          attempt,
          maximumRetryCount: 1,
          delayMs: 0,
        });
      }
    }

    return {
      success: false,
      code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
      reason: 'structured_output_absent',
    };
  }
}

const conversationSummaryService = new ConversationSummaryService();

export {
  ConversationSummaryService,
  buildSummaryInput,
};

export default conversationSummaryService;
