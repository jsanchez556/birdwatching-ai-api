function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function optionalPositiveInteger(value, fieldName, errors) {
  if (value === undefined) return undefined;

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    errors.push(`${fieldName} must be a positive integer`);
    return undefined;
  }

  return normalized;
}

function optionalDate(value, fieldName, errors) {
  if (value === undefined || value === null || value === '') return undefined;

  if (!isIsoDate(value)) {
    errors.push(`${fieldName} must use YYYY-MM-DD format`);
    return undefined;
  }

  return value;
}

export function validateAddCartItemBody(req) {
  const errors = [];
  const tourId = optionalPositiveInteger(req.body.tourId, 'tourId', errors);
  const participants = optionalPositiveInteger(req.body.participants, 'participants', errors);
  const scheduledDate = optionalDate(req.body.scheduledDate, 'Scheduled date', errors);

  if (!tourId) errors.push('tourId is required');

  return {
    message: 'Invalid cart item payload',
    errors,
    value: {
      tourId,
      ...(participants ? { participants } : {}),
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(typeof req.body.needsTransfer === 'boolean'
        ? { needsTransfer: req.body.needsTransfer }
        : {}),
      ...(req.body.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
        ? { metadata: req.body.metadata }
        : {}),
    },
  };
}

export function validateUpdateCartItemBody(req) {
  const errors = [];
  const participants = optionalPositiveInteger(req.body.participants, 'participants', errors);
  const scheduledDate = optionalDate(req.body.scheduledDate, 'Scheduled date', errors);

  return {
    message: 'Invalid cart item payload',
    errors,
    value: {
      ...(participants ? { participants } : {}),
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(typeof req.body.needsTransfer === 'boolean'
        ? { needsTransfer: req.body.needsTransfer }
        : {}),
    },
  };
}

export function validateCreateCartReservationsBody(req) {
  const errors = [];
  const itemIds = Array.isArray(req.body.itemIds)
    ? req.body.itemIds
      .map((itemId) => optionalPositiveInteger(itemId, 'itemIds', errors))
      .filter(Boolean)
    : undefined;

  return {
    message: 'Invalid cart reservation payload',
    errors,
    value: {
      conversationId: typeof req.body.conversationId === 'string'
        ? req.body.conversationId.trim()
        : undefined,
      ...(itemIds ? { itemIds } : {}),
    },
  };
}
