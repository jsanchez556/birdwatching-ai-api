import { sendSseEvent } from './sse.js';

export function sendChatStreamStart(res, data) {
  return sendSseEvent(res, 'start', data);
}

export function sendChatStreamChunk(res, content) {
  return sendSseEvent(res, 'chunk', { content });
}

export function sendChatStreamReplacement(res, content) {
  return sendSseEvent(res, 'replace', { content });
}

export function sendChatStreamCompletion(res, result) {
  return sendSseEvent(res, 'done', {
    conversationId: result.conversationId,
    response: result.response,
    sources: result.sources || [],
    meta: result.meta || {},
  });
}
