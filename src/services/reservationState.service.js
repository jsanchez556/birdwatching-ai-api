import reservationStateQueries from '../db/queries/reservationState.queries.js';
import { normalizeOptionalText } from '../utils/normalizer.utils.js';

const RESERVATION_FIELDS = new Set([
  'tourId',
  'date',
  'participants',
  'pickupLocation',
  'transferRequired',
  'customerName',
  'customerEmail',
  'itineraryStartDate',
  'itineraryEndDate',
  'discountCode',
]);

const REQUIRED_CONFIRMED_FIELDS = [
  'tourId',
  'date',
  'participants',
  'transferRequired',
  'customerName',
  'customerEmail',
  'itineraryStartDate',
  'itineraryEndDate',
];

const CONFIRMATION_PATTERN = /^(?:confirm_reservation|confirm reservation|confirm booking|yes,?\s*(?:please\s*)?(?:book|reserve)(?:\s+it)?|go ahead(?:\s+and\s+(?:book|reserve)(?:\s+it)?)?|please book(?:\s+it)?|create the reservation)$/i;
const CANCELLATION_PATTERN = /^(?:cancel_reservation|cancel reservation|cancel booking)$/i;

function defaultState() {
  return {
    version: 0,
    status: 'collecting_information',
    proposed: {},
    confirmed: {},
    reservationId: null,
    bookingIdempotencyKey: null,
  };
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeFieldValue(field, value) {
  if (!RESERVATION_FIELDS.has(field)) return { valid: false };
  if (value === null) return { valid: true, value: null };

  if (field === 'tourId' || field === 'participants') {
    const number = Number(value);
    return Number.isInteger(number) && number > 0
      ? { valid: true, value: number }
      : { valid: false };
  }

  if (field === 'transferRequired') {
    return typeof value === 'boolean'
      ? { valid: true, value }
      : { valid: false };
  }

  if (['date', 'itineraryStartDate', 'itineraryEndDate'].includes(field)) {
    return isIsoDate(value)
      ? { valid: true, value }
      : { valid: false };
  }

  const text = normalizeOptionalText(value);
  if (!text) return { valid: false };
  if (field === 'customerEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { valid: false };
  }
  if (field === 'discountCode' && !/^[A-Za-z0-9]+$/.test(text)) {
    return { valid: false };
  }
  return { valid: true, value: text };
}

function buildExtractedUpdates(extraction = {}, customerContext = {}) {
  const candidates = {
    tourId: extraction.tourId,
    date: extraction.date,
    participants: extraction.participants,
    pickupLocation: extraction.pickupLocation,
    transferRequired: extraction.transferRequired,
    discountCode: extraction.discountCode,
    customerName: customerContext.customerName,
    customerEmail: customerContext.customerEmail,
    itineraryStartDate: customerContext.itineraryStartDate,
    itineraryEndDate: customerContext.itineraryEndDate,
  };
  const updates = {};
  const invalidFields = [];

  for (const [field, candidate] of Object.entries(candidates)) {
    if (candidate === undefined || candidate === null) continue;
    const normalized = normalizeFieldValue(field, candidate);
    if (normalized.valid) updates[field] = normalized.value;
    else invalidFields.push(field);
  }

  for (const field of extraction.clearedFields || []) {
    if (RESERVATION_FIELDS.has(field)) updates[field] = null;
  }

  return { updates, invalidFields };
}

function applyProposals(state, updates) {
  const proposed = { ...state.proposed };
  const changedFields = [];

  for (const [field, value] of Object.entries(updates)) {
    if (Object.hasOwn(proposed, field) && Object.is(proposed[field], value)) continue;
    if (!Object.hasOwn(proposed, field)
      && Object.hasOwn(state.confirmed, field)
      && Object.is(state.confirmed[field], value)) continue;
    proposed[field] = value;
    changedFields.push(field);
  }

  return { proposed, changedFields };
}

function promoteProposals(state, proposed) {
  const confirmed = { ...state.confirmed };
  const changedFields = [];

  for (const [field, value] of Object.entries(proposed)) {
    const previous = confirmed[field];
    if (value === null) delete confirmed[field];
    else confirmed[field] = value;
    if (!Object.is(previous, value) || value === null) changedFields.push(field);
  }

  return { confirmed, changedFields };
}

function hasRequiredConfirmedFields(confirmed = {}) {
  if (!REQUIRED_CONFIRMED_FIELDS.every((field) => (
    Object.hasOwn(confirmed, field) && confirmed[field] !== null
  ))) return false;

  return confirmed.transferRequired !== true
    || (typeof confirmed.pickupLocation === 'string' && confirmed.pickupLocation.length > 0);
}

function deriveStatus({ confirmed, proposed }) {
  return Object.keys(proposed).length === 0 && hasRequiredConfirmedFields(confirmed)
    ? 'ready_for_confirmation'
    : 'collecting_information';
}

function isExplicitConfirmation(message) {
  return CONFIRMATION_PATTERN.test(normalizeOptionalText(message) || '');
}

function isExplicitCancellation(message) {
  return CANCELLATION_PATTERN.test(normalizeOptionalText(message) || '');
}

function isVersionConflict(error) {
  return error?.code === '40001';
}

export class ReservationStateService {
  constructor({ queries = reservationStateQueries } = {}) {
    this.queries = queries;
  }

  async get(conversationId, userId) {
    return (await this.queries.get(conversationId, userId)) || defaultState();
  }

  async processMessage({
    conversationId,
    userId,
    message,
    extraction = {},
    customerContext = {},
    sourceId,
    confirm = false,
  }) {
    const state = await this.get(conversationId, userId);

    if (isExplicitCancellation(message)) {
      if (state.status !== 'confirmed') {
        return {
          success: false,
          code: 'INVALID_RESERVATION_STATE_TRANSITION',
          retryable: false,
          state,
        };
      }
      return this.persist({
        state,
        conversationId,
        userId,
        proposed: state.proposed,
        confirmed: state.confirmed,
        status: 'cancelled',
        eventType: 'reservation_cancelled',
        changedFields: ['status'],
        sourceId,
      });
    }

    if (state.status === 'confirmed' || state.status === 'cancelled') {
      return { success: true, state, unchanged: true };
    }

    const { updates, invalidFields } = buildExtractedUpdates(extraction, customerContext);
    const applied = applyProposals(state, updates);
    let proposed = applied.proposed;
    let confirmed = state.confirmed;
    let changedFields = applied.changedFields;
    let eventType = changedFields.length ? 'values_proposed' : null;

    const confirmsValues = confirm || isExplicitConfirmation(message);
    if (confirmsValues && Object.keys(proposed).length === 0
      && state.status === 'ready_for_confirmation') {
      return { success: true, state, unchanged: true };
    }

    if (confirmsValues) {
      const promotion = promoteProposals(state, proposed);
      confirmed = promotion.confirmed;
      changedFields = [...new Set([...changedFields, ...promotion.changedFields, 'status'])];
      proposed = {};
      eventType = 'values_confirmed';
    }

    const status = deriveStatus({ confirmed, proposed });
    if (status !== state.status && !changedFields.includes('status')) changedFields.push('status');

    if (!eventType || changedFields.length === 0) {
      return {
        success: true,
        state,
        unchanged: true,
        ...(invalidFields.length ? { invalidFields } : {}),
      };
    }

    return this.persist({
      state,
      conversationId,
      userId,
      proposed,
      confirmed,
      status,
      eventType,
      changedFields,
      sourceId,
      invalidFields,
    });
  }

  async proposeValidated({ conversationId, userId, expectedVersion, values, sourceId }) {
    const state = await this.get(conversationId, userId);
    if (expectedVersion !== undefined && state.version !== expectedVersion) {
      return {
        success: false,
        code: 'RESERVATION_STATE_CONFLICT',
        retryable: true,
        state,
      };
    }
    const { updates, invalidFields } = buildExtractedUpdates(values, {});
    if (invalidFields.length) {
      return { success: false, code: 'INVALID_RESERVATION_STATE', retryable: false, state };
    }
    const applied = applyProposals(state, updates);
    if (!applied.changedFields.length) return { success: true, state, unchanged: true };
    return this.persist({
      state,
      conversationId,
      userId,
      proposed: applied.proposed,
      confirmed: state.confirmed,
      status: 'collecting_information',
      eventType: 'validated_values_proposed',
      changedFields: [...applied.changedFields, ...(state.status !== 'collecting_information' ? ['status'] : [])],
      sourceId,
      sourceType: 'validated_tool_result',
    });
  }

  async persist({
    state,
    conversationId,
    userId,
    proposed,
    confirmed,
    status,
    eventType,
    changedFields,
    sourceId,
    sourceType = 'user_message',
    invalidFields = [],
  }) {
    try {
      const nextState = await this.queries.mutate({
        conversationId,
        userId,
        expectedVersion: state.version,
        proposed,
        confirmed,
        status,
        eventType,
        changedFields,
        sourceType,
        sourceId,
      });
      return {
        success: true,
        state: nextState,
        ...(invalidFields.length ? { invalidFields } : {}),
      };
    } catch (error) {
      if (isVersionConflict(error)) {
        return {
          success: false,
          code: 'RESERVATION_STATE_CONFLICT',
          retryable: true,
          state: await this.get(conversationId, userId),
        };
      }
      throw error;
    }
  }
}

export {
  REQUIRED_CONFIRMED_FIELDS,
  applyProposals,
  buildExtractedUpdates,
  defaultState,
  deriveStatus,
  hasRequiredConfirmedFields,
  isExplicitConfirmation,
  normalizeFieldValue,
  promoteProposals,
};

export default new ReservationStateService();
