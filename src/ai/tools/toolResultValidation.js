const OPERATIONAL_TTL_MS = Object.freeze({
  searchTours: 15 * 60 * 1000,
  checkAvailability: 2 * 60 * 1000,
  calculatePricing: 5 * 60 * 1000,
  calculateTransfer: 15 * 60 * 1000,
});

const INVALID_STATUSES = new Set([
  'failed', 'cancelled', 'canceled', 'timed_out', 'timeout', 'partial', 'incomplete',
]);

function hasIdentifier(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function hasValidTour(tour) {
  return tour && hasIdentifier(tour.tourId ?? tour.id) && typeof tour.name === 'string';
}

function validateKnownToolSchema(toolName, result = {}) {
  if (toolName === 'searchTours') {
    return Array.isArray(result.tours) && result.tours.every(hasValidTour);
  }
  if (toolName === 'checkAvailability') {
    return hasIdentifier(result.tourId)
      && typeof result.isAvailable === 'boolean'
      && isFiniteNumber(result.availableSlots);
  }
  if (toolName === 'calculatePricing') {
    return hasIdentifier(result.tourId)
      && isFiniteNumber(result.participants)
      && isFiniteNumber(result.totalPrice ?? result.total)
      && typeof result.currency === 'string';
  }
  if (toolName === 'calculateTransfer') {
    return typeof result.origin === 'string'
      && typeof result.destination === 'string'
      && Array.isArray(result.options)
      && result.options.length > 0
      && result.options.every((option) => (
        hasIdentifier(option?.type)
        && isFiniteNumber(option?.totalPrice)
        && typeof option?.currency === 'string'
      ));
  }
  if (toolName === 'createReservation') {
    return hasIdentifier(result.reservationId ?? result.id)
      && hasIdentifier(result.confirmationCode)
      && hasIdentifier(result.tourId)
      && isFiniteNumber(result.participants);
  }
  return result && typeof result === 'object' && !Array.isArray(result);
}

function validateToolResultForContext(toolName, result, {
  metadata = {},
  status,
  now = new Date(),
} = {}) {
  const normalizedStatus = String(status || result?.status || '').trim().toLowerCase();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { valid: false, reason: 'malformed_tool_result' };
  }
  if (result.success !== true || INVALID_STATUSES.has(normalizedStatus)
    || result.partial === true || result.complete === false) {
    return { valid: false, reason: INVALID_STATUSES.has(normalizedStatus)
      ? `tool_${normalizedStatus}` : 'unsuccessful_tool_result' };
  }
  if (!validateKnownToolSchema(toolName, result)) {
    return { valid: false, reason: 'schema_invalid_tool_result' };
  }
  if (!metadata.conversationId) {
    return { valid: false, reason: 'missing_tool_scope' };
  }

  const retrievedAt = now.toISOString();
  const ttlMs = OPERATIONAL_TTL_MS[toolName];
  return {
    valid: true,
    reason: 'validated_successful_tool_result',
    sourceType: 'validated_tool_result',
    retrievedAt,
    expiresAt: ttlMs ? new Date(now.getTime() + ttlMs).toISOString() : null,
    scope: {
      kind: 'conversation',
      tenantId: metadata.tenantId == null ? null : String(metadata.tenantId),
      userId: metadata.userId == null ? null : String(metadata.userId),
      conversationId: String(metadata.conversationId),
    },
  };
}

function attachToolContextValidation(result, validation) {
  if (!result || typeof result !== 'object') return result;
  Object.defineProperty(result, 'contextValidation', {
    value: validation,
    enumerable: false,
    configurable: true,
  });
  return result;
}

export {
  INVALID_STATUSES,
  OPERATIONAL_TTL_MS,
  attachToolContextValidation,
  validateKnownToolSchema,
  validateToolResultForContext,
};
