import { estimateTokens } from '../context/contextBudget.js';
import { createStableHash } from '../../utils/hash.utils.js';
import { validateToolResultForContext } from '../tools/toolResultValidation.js';

const UNSAFE_KEY_PATTERN = /(?:authorization|cookie|password|secret|token|stack|sql|query|providerResponse|raw|internal|supplier[_-]?contract|database[_-]?(?:created|updated)[_-]?at)/i;
const DEFAULT_MAX_INLINE_ITEMS = 8;
const DEFAULT_MAX_INLINE_TOKENS = 600;
const DEFAULT_SELECTED_RESULT_LIMIT = 5;
const COLLECTION_KEYS = ['results', 'tours', 'items', 'options', 'records', 'data'];
const RELEVANT_RESULT_KEYS = new Set([
  'id', 'tourId', 'reservationId', 'confirmationCode', 'name', 'title', 'status',
  'success', 'code', 'message', 'location', 'price', 'pricePerPerson', 'totalPrice',
  'currency', 'nextAvailableDate', 'date', 'startDate', 'availableSlots',
  'durationHours', 'difficulty', 'type', 'origin', 'destination',
  'estimatedTravelTime', 'participants', 'participantCount', 'recommended',
]);
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
  'transfer',
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

function findPrimaryCollection(result = {}) {
  if (Array.isArray(result)) return { key: 'results', values: result };
  if (!result || typeof result !== 'object') return { key: null, values: [] };
  for (const key of COLLECTION_KEYS) {
    if (Array.isArray(result[key])) return { key, values: result[key] };
  }
  return { key: null, values: [] };
}

function getToolResultTotal(result, values = []) {
  const candidates = [
    result?.total,
    result?.totalCount,
    result?.count,
    result?.pagination?.total,
    values.length,
  ];
  const total = candidates.map(Number).find((value) => Number.isSafeInteger(value) && value >= 0);
  return total ?? 0;
}

function shouldCompactToolResult(result, {
  maxInlineItems = DEFAULT_MAX_INLINE_ITEMS,
  maxInlineTokens = DEFAULT_MAX_INLINE_TOKENS,
} = {}) {
  const { values } = findPrimaryCollection(result);
  if (values.length > maxInlineItems) return true;
  try {
    return estimateTokens(JSON.stringify(result)) > maxInlineTokens;
  } catch {
    return true;
  }
}

function nextAvailableDate(item = {}) {
  if (item.nextAvailableDate) return item.nextAvailableDate;
  if (!Array.isArray(item.availability)) return undefined;
  const entry = item.availability.find((candidate) => (
    candidate && (candidate.available !== false) && (candidate.date || candidate.startDate)
  ));
  return entry?.date || entry?.startDate;
}

function projectResultItem(item, tool) {
  if (!item || typeof item !== 'object') {
    return typeof item === 'string' && item.length > 240
      ? `${item.slice(0, 237)}...`
      : item;
  }
  const projected = Object.fromEntries(Object.entries(item)
    .filter(([key]) => RELEVANT_RESULT_KEYS.has(key))
    .filter(([key]) => !UNSAFE_KEY_PATTERN.test(key))
    .map(([key, value]) => [key, sanitizeToolValue(value)]));
  if (tool === 'searchTours') {
    projected.tourId = item.tourId ?? item.id;
    projected.name = item.name;
    projected.price = item.price ?? item.pricePerPerson;
    delete projected.id;
    delete projected.pricePerPerson;
    const availableDate = nextAvailableDate(item);
    if (availableDate) projected.nextAvailableDate = availableDate;
    for (const key of ['location', 'currency', 'durationHours', 'difficulty', 'availableSlots']) {
      if (item[key] !== undefined) projected[key] = sanitizeToolValue(item[key]);
    }
    for (const key of Object.keys(projected)) {
      if (projected[key] === undefined) delete projected[key];
    }
  }
  return projected;
}

function compactPagination(pagination = {}) {
  if (!pagination || typeof pagination !== 'object') return undefined;
  const compacted = Object.fromEntries(
    ['page', 'pageSize', 'total', 'totalPages', 'hasMore', 'nextCursor']
      .filter((key) => pagination[key] !== undefined)
      .map((key) => [key, pagination[key]])
  );
  return Object.keys(compacted).length ? compacted : undefined;
}

function compactLargeToolResult(tool, result, {
  resultReferenceId,
  selectedResultLimit = DEFAULT_SELECTED_RESULT_LIMIT,
} = {}) {
  const normalized = result && typeof result === 'object' ? result : { value: result };
  const { values } = findPrimaryCollection(normalized);
  const selectedResults = values.slice(0, selectedResultLimit)
    .map((item) => projectResultItem(item, tool));
  const pagination = compactPagination(normalized.pagination);
  const summaryFields = projectResultItem(normalized, tool);
  return {
    ...(resultReferenceId ? { resultReferenceId } : { resultReferenceUnavailable: true }),
    ...(normalized.success !== undefined ? { success: normalized.success } : {}),
    ...(normalized.status !== undefined ? { status: normalized.status } : {}),
    ...(normalized.code !== undefined ? { code: normalized.code } : {}),
    ...(normalized.message !== undefined ? { message: normalized.message } : {}),
    ...summaryFields,
    total: getToolResultTotal(normalized, values),
    selectedResults,
    ...(pagination ? { pagination } : {}),
    omittedResultCount: Math.max(0, getToolResultTotal(normalized, values) - selectedResults.length),
  };
}

function compactToolResultForPrompt(tool, result, options = {}) {
  if (shouldCompactToolResult(result, options)) {
    return compactLargeToolResult(tool, result, options);
  }
  return sanitizeToolValue(result, { reservationResult: tool === 'createReservation' });
}

function compactToolResults(toolResults = [], { now = new Date(), scope = {} } = {}) {
  return (Array.isArray(toolResults) ? toolResults : []).flatMap((step, index) => {
    const tool = String(step?.tool || 'unknown_tool');
    const reservationResult = tool === 'createReservation';
    const rawResult = step?.result ?? step?.error ?? null;
    const contextValidation = rawResult?.contextValidation
      || validateToolResultForContext(tool, rawResult, {
        metadata: {
          tenantId: scope.tenantId ?? step?.tenantId,
          userId: scope.userId ?? step?.userId,
          conversationId: scope.conversationId ?? step?.conversationId ?? 'legacy_internal_context',
        },
        status: step?.status,
        now,
      });
    if (!contextValidation.valid) return [];
    const largeResult = shouldCompactToolResult(rawResult);
    const safeResult = compactToolResultForPrompt(tool, rawResult, {
      resultReferenceId: step?.resultReferenceId || rawResult?.resultReferenceId,
    });
    const content = JSON.stringify({
      tool,
      status: step?.status || (step?.error ? 'failed' : 'completed'),
      result: safeResult,
    });

    return [{
      id: String(step?.id || `tool-result:${tool}:${index}`),
      type: 'tool_result',
      content,
      source: `tool:${tool}`,
      sourceType: 'validated_tool_result',
      relevanceScore: reservationResult ? 1 : 0.85,
      trustLevel: 'validated_tool_result',
      createdAt: step?.createdAt || now,
      retrievedAt: contextValidation.retrievedAt || now,
      ...((rawResult?.resultReferenceExpiresAt || contextValidation.expiresAt)
        ? { expiresAt: rawResult?.resultReferenceExpiresAt || contextValidation.expiresAt } : {}),
      originalContentHash: createStableHash(rawResult),
      transformationHistory: [
        'field_filtering',
        ...(largeResult ? ['tool_result_compaction'] : []),
        ...(rawResult?.resultReferenceId ? ['result_reference_storage'] : []),
      ],
      estimatedTokens: estimateTokens(content),
      required: reservationResult,
      metadata: {
        tool,
        sourceType: 'validated_tool_result',
        sourceId: rawResult?.resultReferenceId || step?.id || `${tool}:${index}`,
        status: step?.status || (step?.error ? 'failed' : 'completed'),
        contextValidation,
        scope: contextValidation.scope,
        compacted: true,
        order: index,
      },
    }];
  });
}

export {
  COLLECTION_KEYS,
  DEFAULT_MAX_INLINE_ITEMS,
  DEFAULT_MAX_INLINE_TOKENS,
  DEFAULT_SELECTED_RESULT_LIMIT,
  RESERVATION_KEYS,
  UNSAFE_KEY_PATTERN,
  compactLargeToolResult,
  compactToolResultForPrompt,
  compactToolResults,
  findPrimaryCollection,
  getToolResultTotal,
  projectResultItem,
  sanitizeToolValue,
  shouldCompactToolResult,
};
