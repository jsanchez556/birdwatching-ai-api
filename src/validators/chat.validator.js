const MAX_CHAT_MESSAGE_LENGTH = 4000;
const MAX_CONVERSATION_ID_LENGTH = 128;
const budgets = ['budget', 'moderate', 'luxury'];

export function validateChatBody(req) {
  const { message, conversationId } = req.body;
  const errors = [];

  if (!message || typeof message !== 'string' || !message.trim()) {
    errors.push('Message is required and must be a non-empty string');
  } else if (message.trim().length > MAX_CHAT_MESSAGE_LENGTH) {
    errors.push(`Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`);
  }

  if (conversationId !== undefined && conversationId !== null) {
    if (typeof conversationId !== 'string' || !conversationId.trim()) {
      errors.push('Conversation ID must be a non-empty string when provided');
    } else if (conversationId.trim().length > MAX_CONVERSATION_ID_LENGTH) {
      errors.push(`Conversation ID must be ${MAX_CONVERSATION_ID_LENGTH} characters or fewer`);
    }
  }

  return {
    message: 'Invalid chat payload',
    errors,
    value: {
      message: typeof message === 'string' ? message.trim() : message,
      conversationId: typeof conversationId === 'string' ? conversationId.trim() : undefined,
    },
  };
}

export function validateRecommendationBody(req) {
  const { location, budget, days } = req.body;
  const errors = [];

  if (!location || typeof location !== 'string' || !location.trim()) {
    errors.push('Location is required and must be a non-empty string');
  }

  if (!budget || typeof budget !== 'string' || !budgets.includes(budget.toLowerCase())) {
    errors.push('Budget is required and must be one of: budget, moderate, luxury');
  }

  const daysNumber = Number(days);
  if (!Number.isInteger(daysNumber) || daysNumber <= 0 || daysNumber > 30) {
    errors.push('Days is required and must be an integer between 1 and 30');
  }

  return {
    message: 'Invalid recommendation payload',
    errors,
    value: {
      location: typeof location === 'string' ? location.trim() : location,
      budget: typeof budget === 'string' ? budget.toLowerCase() : budget,
      days: daysNumber,
    },
  };
}
