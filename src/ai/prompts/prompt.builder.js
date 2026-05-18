import { getSystemPrompt } from './system.prompt.js';
import { createRagContextMessage } from './rag.context.js';

const VALID_MESSAGE_ROLES = new Set(['system', 'user', 'assistant', 'tool']);

function normalizeContent(content) {
  return typeof content === 'string' ? content : String(content ?? '');
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const { role } = message;

  if (!VALID_MESSAGE_ROLES.has(role)) {
    return null;
  }

  return {
    ...message,
    content: normalizeContent(message.content),
  };
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map(normalizeMessage).filter(Boolean);
}

function normalizeSystemPrompt(systemPrompt) {
  if (systemPrompt && typeof systemPrompt === 'object') {
    return normalizeMessage({
      ...systemPrompt,
      role: 'system',
    });
  }

  return {
    role: 'system',
    content: normalizeContent(systemPrompt),
  };
}

function normalizeRagContext(ragContext) {
  if (!ragContext) {
    return [];
  }

  if (Array.isArray(ragContext)) {
    const messages = normalizeMessages(ragContext);

    if (messages.length > 0) {
      return messages;
    }

    return ragContext.length > 0 ? [createRagContextMessage(ragContext)] : [];
  }

  if (typeof ragContext === 'object') {
    const message = normalizeMessage(ragContext);
    return message ? [message] : [];
  }

  return [
    {
      role: 'system',
      content: normalizeContent(ragContext),
    },
  ];
}

export function buildPrompt({
  systemPrompt,
  ragContext,
  memoryContext = [],
  userMessage,
} = {}) {
  return [
    normalizeSystemPrompt(systemPrompt),
    ...normalizeRagContext(ragContext),
    ...normalizeMessages(memoryContext),
    {
      role: 'user',
      content: normalizeContent(userMessage),
    },
  ].filter(Boolean);
}

export function buildChatMessages({
  userMessage,
  history = [],
  systemPromptVersion,
} = {}) {
  return buildPrompt({
    systemPrompt: getSystemPrompt('chat', systemPromptVersion),
    memoryContext: history,
    userMessage,
  });
}

export function injectRagContextMessage(messages, documents = []) {
  if (!Array.isArray(messages) || messages.length === 0 || !Array.isArray(documents) || documents.length === 0) {
    return messages;
  }

  return [
    messages[0],
    createRagContextMessage(documents),
    ...messages.slice(1),
  ];
}
