import { validateChatBody } from './chat.validator.js';
import { FIELD_ASSISTANT_RESPONSE_MODE } from '../../ai/prompts/system.prompt.js';

function parseJsonHeader(value, fieldName, errors) {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push(`${fieldName} must be a JSON object`);
      return undefined;
    }

    return parsed;
  } catch (error) {
    errors.push(`${fieldName} must be valid JSON`);
    return undefined;
  }
}

export function validateVoiceChatContext(req) {
  const errors = [];
  const customerContext = parseJsonHeader(req.headers['x-customer-context'], 'X-Customer-Context', errors);
  const conversationContext = parseJsonHeader(req.headers['x-conversation-context'], 'X-Conversation-Context', errors);
  const chatValidation = validateChatBody({
    body: {
      message: 'voice-chat-validation-placeholder',
      conversationId: req.headers['x-conversation-id'],
      customerContext,
      conversationContext,
      role: req.headers['x-role'],
      responseMode: req.headers['x-response-mode'],
    },
  });

  return {
    message: 'Invalid voice chat context',
    errors: [...errors, ...chatValidation.errors],
    value: {
      conversationId: chatValidation.value.conversationId,
      customerContext: chatValidation.value.customerContext,
      conversationContext: chatValidation.value.conversationContext,
      role: chatValidation.value.role,
      responseMode: chatValidation.value.responseMode || (
        req.headers['x-field-assistant'] === 'true' ? FIELD_ASSISTANT_RESPONSE_MODE : undefined
      ),
    },
  };
}
