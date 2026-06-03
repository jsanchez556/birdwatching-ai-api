import {
  normalizeOptionalText,
  normalizeSelectedTransportation,
} from '../utils/normalizers.js';

const MAX_CHAT_MESSAGE_LENGTH = 4000;
const MAX_CONVERSATION_ID_LENGTH = 128;
const RESERVATION_ENTRY_SOURCES = new Set(['featured_tour', 'tour_cart']);

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeCustomerContext(rawContext, errors) {
  if (rawContext === undefined || rawContext === null) {
    return undefined;
  }

  if (typeof rawContext !== 'object' || Array.isArray(rawContext)) {
    errors.push('Customer context must be an object when provided');
    return undefined;
  }

  const customerName = normalizeOptionalText(rawContext.customerName);
  const customerEmail = normalizeOptionalText(rawContext.customerEmail);
  const itineraryStartDate = normalizeOptionalText(rawContext.itineraryStartDate);
  const itineraryEndDate = normalizeOptionalText(rawContext.itineraryEndDate);

  if (rawContext.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawContext.customerEmail)) {
    errors.push('Customer email must be a valid email address');
  }

  if (itineraryStartDate && !isIsoDate(itineraryStartDate)) {
    errors.push('Itinerary start date must use YYYY-MM-DD format');
  }

  if (itineraryEndDate && !isIsoDate(itineraryEndDate)) {
    errors.push('Itinerary end date must use YYYY-MM-DD format');
  }

  if (itineraryStartDate && itineraryEndDate && itineraryStartDate > itineraryEndDate) {
    errors.push('Itinerary end date must be on or after the start date');
  }

  return {
    customerName,
    customerEmail,
    itineraryStartDate,
    itineraryEndDate,
  };
}

function normalizeTourSummary(tour) {
  if (!tour || typeof tour !== 'object') {
    return null;
  }

  const tourId = Number(tour.tourId);

  if (!Number.isInteger(tourId) || tourId <= 0 || typeof tour.name !== 'string') {
    return null;
  }

  const normalized = {
    tourId,
    name: tour.name,
    location: normalizeOptionalText(tour.location),
    node: normalizeOptionalText(tour.node),
    subnode: normalizeOptionalText(tour.subnode),
    zone: normalizeOptionalText(tour.zone),
    pricePerPerson: Number.isFinite(Number(tour.pricePerPerson)) ? Number(tour.pricePerPerson) : undefined,
    availableSlots: Number.isFinite(Number(tour.availableSlots)) ? Number(tour.availableSlots) : undefined,
    duration: normalizeOptionalText(tour.duration),
    durationHours: Number.isFinite(Number(tour.durationHours)) ? Number(tour.durationHours) : undefined,
    difficulty: normalizeOptionalText(tour.difficulty),
    scheduledDate: isIsoDate(tour.scheduledDate) ? tour.scheduledDate : undefined,
    participants: Number.isInteger(Number(tour.participants)) && Number(tour.participants) > 0
      ? Number(tour.participants)
      : undefined,
    needsTransportation: tour.needsTransportation === true ? true : undefined,
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function normalizeReservationEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    return undefined;
  }

  const source = RESERVATION_ENTRY_SOURCES.has(rawEntry.source) ? rawEntry.source : undefined;
  const tours = Array.isArray(rawEntry.tours)
    ? rawEntry.tours.map(normalizeTourSummary).filter(Boolean).slice(0, 10)
    : [];

  if (!source || tours.length === 0) {
    return undefined;
  }

  return {
    source,
    tours,
    ...(rawEntry.cart && typeof rawEntry.cart === 'object' && !Array.isArray(rawEntry.cart)
      ? {
        cart: {
          ...(isIsoDate(rawEntry.cart.itineraryStartDate)
            ? { itineraryStartDate: rawEntry.cart.itineraryStartDate }
            : {}),
          ...(isIsoDate(rawEntry.cart.itineraryEndDate)
            ? { itineraryEndDate: rawEntry.cart.itineraryEndDate }
            : {}),
          ...(Number.isInteger(Number(rawEntry.cart.count)) && Number(rawEntry.cart.count) > 0
            ? { count: Number(rawEntry.cart.count) }
            : {}),
        },
      }
      : {}),
  };
}

function normalizeConversationContext(rawContext, errors) {
  if (rawContext === undefined || rawContext === null) {
    return undefined;
  }

  if (typeof rawContext !== 'object' || Array.isArray(rawContext)) {
    errors.push('Conversation context must be an object when provided');
    return undefined;
  }

  const metadata = rawContext.recentAssistantMetadata;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const tours = Array.isArray(metadata.tours)
    ? metadata.tours.map(normalizeTourSummary).filter(Boolean).slice(0, 5)
    : undefined;
  const reservationEntry = normalizeReservationEntry(metadata.reservationEntry);
  const conversationSource = RESERVATION_ENTRY_SOURCES.has(metadata.conversationSource)
    ? metadata.conversationSource
    : RESERVATION_ENTRY_SOURCES.has(metadata.entrySource)
      ? metadata.entrySource
      : reservationEntry?.source;
  const conversationType = metadata.conversationType === 'reservation_entry' || reservationEntry
    ? 'reservation_entry'
    : undefined;

  return {
    recentAssistantMetadata: {
      ...(conversationType ? { conversationType } : {}),
      ...(conversationSource ? { conversationSource, entrySource: conversationSource } : {}),
      ...(reservationEntry ? { reservationEntry } : {}),
      ...(tours ? { tours } : {}),
      ...(normalizeTourSummary(metadata.selectedTour)
        ? { selectedTour: normalizeTourSummary(metadata.selectedTour) }
        : {}),
      ...(Number.isInteger(Number(metadata.selectedTourId))
        ? { selectedTourId: Number(metadata.selectedTourId) }
        : {}),
      ...(Number.isInteger(Number(metadata.participants)) && Number(metadata.participants) > 0
        ? { participants: Number(metadata.participants) }
        : {}),
      ...(normalizeSelectedTransportation(metadata.selectedTransportation)
        ? { selectedTransportation: normalizeSelectedTransportation(metadata.selectedTransportation) }
        : {}),
      ...(metadata.transportationDeclined === true
        ? { transportationDeclined: true }
        : {}),
      ...(metadata.requestedTransportation === true
        ? { requestedTransportation: true }
        : {}),
      ...(metadata.uiAction && typeof metadata.uiAction === 'object'
        ? { uiAction: metadata.uiAction }
        : {}),
      ...(Array.isArray(metadata.toolsCalled)
        ? { toolsCalled: metadata.toolsCalled.filter((tool) => typeof tool === 'string').slice(0, 10) }
        : {}),
    },
  };
}

export function validateChatBody(req) {
  const {
    message,
    conversationId,
    customerContext,
    conversationContext,
    role,
  } = req.body;
  const errors = [];
  const normalizedCustomerContext = normalizeCustomerContext(customerContext, errors);
  const normalizedConversationContext = normalizeConversationContext(conversationContext, errors);

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
      customerContext: normalizedCustomerContext,
      conversationContext: normalizedConversationContext,
      role: role === 'visitor' ? 'visitor' : undefined,
    },
  };
}
