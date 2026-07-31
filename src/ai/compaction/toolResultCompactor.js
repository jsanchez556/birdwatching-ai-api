import { estimateTokens } from '../context/contextBudget.js';

const UNSAFE_KEY_PATTERN = /(?:authorization|cookie|password|secret|token|stack|sql|query|providerResponse|raw)/i;
const RESERVATION_KEYS = new Set([
  'reservationId',
  'confirmationCode',
  'status',
  'tourId',
  'tourName',
  'participantCount',
  'participants',
  'total',
  'totalPrice',
  'currency',
  'customerName',
  'itineraryDates',
  'transportation',
]);

function sanitizeToolValue(value, { reservationResult = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeToolValue(entry, { reservationResult }));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !UNSAFE_KEY_PATTERN.test(key))
    .filter(([key]) => !reservationResult || RESERVATION_KEYS.has(key) || key === 'error' || key === 'message')
    .map(([key, entry]) => [
      key,
      sanitizeToolValue(entry, { reservationResult: false }),
    ]));
}

function compactToolResults(toolResults = [], { now = new Date() } = {}) {
  return (Array.isArray(toolResults) ? toolResults : []).map((step, index) => {
    const tool = String(step?.tool || 'unknown_tool');
    const reservationResult = tool === 'createReservation';
    const safeResult = sanitizeToolValue(step?.result ?? step?.error ?? null, {
      reservationResult,
    });
    const content = JSON.stringify({
      tool,
      status: step?.status || (step?.error ? 'failed' : 'completed'),
      result: safeResult,
    });

    return {
      id: String(step?.id || `tool-result:${tool}:${index}`),
      type: 'tool_result',
      content,
      source: `tool:${tool}`,
      relevanceScore: reservationResult ? 1 : 0.85,
      trustLevel: 'verified',
      createdAt: step?.createdAt || now,
      estimatedTokens: estimateTokens(content),
      required: reservationResult,
      metadata: {
        tool,
        status: step?.status || (step?.error ? 'failed' : 'completed'),
        compacted: true,
        order: index,
      },
    };
  });
}

export {
  RESERVATION_KEYS,
  UNSAFE_KEY_PATTERN,
  compactToolResults,
  sanitizeToolValue,
};
