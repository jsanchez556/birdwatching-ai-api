import openaiClient from '../clients/openai.client.js';
import {
  RESERVATION_INTENT_PROMPT_VERSION,
  RESERVATION_INTENT_SYSTEM_PROMPT,
} from '../prompts/reservationIntent.prompt.js';
import { ReservationIntentSchema } from '../schemas/reservationIntent.schema.js';
import { getModel, MODEL_KEYS, MODEL_REGISTRY } from '../routing/modelRegistry.js';
import logger from '../../utils/logger.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import { classifyOpenAIError } from '../utils/openaiRetry.utils.js';

const MAX_EXTRACTION_ATTEMPTS = 2;

function hasMissingField(result, field) {
  return result.missingFields.includes(field);
}

function validateMissingFieldConsistency(result) {
  const inconsistentField = result.missingFields.find((field) => result[field] !== null);

  if (inconsistentField) {
    return {
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'inconsistent_missing_fields',
    };
  }

  const inconsistentClearedField = result.clearedFields.find((field) => result[field] !== null);

  if (inconsistentClearedField) {
    return {
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'inconsistent_cleared_fields',
    };
  }

  const requiredNullFields = [];
  const hasTourSelector = result.tourId !== null || result.location !== null;

  if (['select_tour', 'check_availability', 'calculate_price', 'create_reservation'].includes(result.intent)
    && !hasTourSelector) {
    requiredNullFields.push('tourId', 'location');
  }
  if (['select_date', 'check_availability', 'create_reservation'].includes(result.intent) && result.date === null) {
    requiredNullFields.push('date');
  }
  if (['calculate_price', 'create_reservation'].includes(result.intent)
    && result.participants === null) {
    requiredNullFields.push('participants');
  }
  if (result.intent === 'create_reservation' && result.transferRequired === null) {
    requiredNullFields.push('transferRequired');
  }
  if (result.transferRequired === true && result.pickupLocation === null) {
    requiredNullFields.push('pickupLocation');
  }

  if (requiredNullFields.some((field) => !hasMissingField(result, field))) {
    return {
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'missing_required_field_markers',
    };
  }

  return { success: true, data: result };
}

function validateParsedIntent(parsed) {
  const validation = ReservationIntentSchema.safeParse({
    ...parsed,
    clearedFields: parsed?.clearedFields ?? [],
    discountCode: parsed?.discountCode ?? null,
  });

  if (!validation.success) {
    return {
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'schema_validation_failed',
    };
  }

  return validateMissingFieldConsistency(validation.data);
}

class ReservationIntentExtractor {
  constructor({
    client = openaiClient,
    log = logger,
    model = getModel(MODEL_REGISTRY, MODEL_KEYS.STRUCTURED_RELIABLE).modelId,
  } = {}) {
    this.client = client;
    this.logger = log;
    this.model = model;
  }

  async extract({ message, signal, metadata = {} } = {}) {
    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
      try {
        const completion = await this.client.parseStructuredChatCompletion([
          { role: 'system', content: RESERVATION_INTENT_SYSTEM_PROMPT },
          { role: 'user', content: message },
        ], {
          schema: ReservationIntentSchema,
          schemaName: 'reservation_intent',
          model: this.model,
          signal,
          usage: metadata.usage,
          metadata: {
            parentTraceId: metadata.agentTraceId || metadata.parentTraceId,
            conversationId: metadata.conversationId,
            promptVersion: RESERVATION_INTENT_PROMPT_VERSION,
            operation: 'intent_classification',
          },
        });
        const responseMessage = completion.choices?.[0]?.message;

        if (responseMessage?.refusal !== undefined && responseMessage?.refusal !== null) {
          this.logger.warn('Reservation intent extraction refused', {
            model: completion.model || this.model,
            requestId: completion.id,
          });
          return {
            success: false,
            code: 'RESERVATION_INTENT_REFUSED',
            reason: 'model_refusal',
          };
        }

        const validation = validateParsedIntent(responseMessage?.parsed);

        if (validation.success) {
          return validation;
        }

        this.logger.warn('Reservation intent extraction returned invalid structured output', {
          model: completion.model || this.model,
          requestId: completion.id,
          attempt,
          reason: validation.reason,
        });

        if (attempt === MAX_EXTRACTION_ATTEMPTS) {
          return validation;
        }

        aiTelemetry.recordAiRetry({
          operation: 'reservation_intent_schema_correction',
          category: 'invalid_schema',
          retryKind: 'corrective',
          attempt,
          maximumRetryCount: 1,
          delayMs: 0,
        });
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          throw error;
        }

        const classification = classifyOpenAIError(error);

        this.logger.warn('Reservation intent structured parsing failed', {
          model: this.model,
          attempt,
          errorName: error?.name,
          errorCategory: classification.category,
        });

        if (
          classification.retryKind !== 'corrective'
          || attempt === MAX_EXTRACTION_ATTEMPTS
        ) {
          return {
            success: false,
            code: 'RESERVATION_INTENT_INVALID_OUTPUT',
            reason: 'structured_parse_failed',
          };
        }

        aiTelemetry.recordAiRetry({
          operation: 'reservation_intent_schema_correction',
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
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'structured_output_absent',
    };
  }
}

export {
  ReservationIntentExtractor,
  validateParsedIntent,
};

export default new ReservationIntentExtractor();
