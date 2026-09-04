import { randomBytes } from 'crypto';
import reservationQueries from '../db/queries/reservation.queries.js';
import reservationStateQueries from '../db/queries/reservationState.queries.js';
import tourQueries from '../db/queries/tour.queries.js';
import { DEFAULT_CURRENCY } from '../constants/business.js';
import logger from '../utils/logger.js';
import analytics from '../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../analytics/events.js';
import { getTourRecommendationEventProperties } from '../experiments/tourRecommendation.experiment.js';
import {
  normalizeComparableText,
  normalizeOptionalText,
  normalizeText,
} from '../utils/normalizer.utils.js';
import { invalidArguments, toPositiveInteger } from '../utils/toolResponses.js';

const MAX_CONFIRMATION_ATTEMPTS = 3;

function normalizeCustomerName(customerName) {
  const reservationName = normalizeText(customerName);

  if (!reservationName) {
    throw new Error('customerName is required');
  }

  return reservationName;
}

function buildReservationResult({ reservation, tour, discount, itineraryStartDate, itineraryEndDate }) {
  const totalPrice = reservation.totalPrice;
  const normalizedItineraryStartDate = normalizeOptionalText(itineraryStartDate);
  const normalizedItineraryEndDate = normalizeOptionalText(itineraryEndDate);

  return {
    success: true,
    id: reservation.id,
    reservationId: reservation.id,
    userId: reservation.userId,
    customerName: reservation.customerName,
    customerEmail: reservation.customerEmail,
    conversationId: reservation.conversationId,
    tourId: reservation.tourId,
    tourName: tour.name,
    type: tour.type || 'Birdwatching',
    participants: reservation.participants,
    confirmationCode: reservation.confirmationCode,
    createdAt: reservation.createdAt,
    totalPrice,
    tourDate: reservation.tourDate,
    tourTotalPrice: totalPrice,
    ...(normalizedItineraryStartDate ? { itineraryStartDate: normalizedItineraryStartDate } : {}),
    ...(normalizedItineraryEndDate ? { itineraryEndDate: normalizedItineraryEndDate } : {}),
    currency: DEFAULT_CURRENCY,
    remainingSlots: tour.availableSlots,
    discountRate: discount.discountRate,
    discountReason: discount.discountReason,
  };
}

function textMatchesTour(tour, selectedText) {
  const selection = normalizeComparableText(selectedText);

  if (!selection || !tour) {
    return false;
  }

  return [tour.name, tour.location]
    .map(normalizeComparableText)
    .filter(Boolean)
    .some((value) => value === selection);
}

function calculateDiscount(participants, discountCode) {
  const code = typeof discountCode === 'string' ? discountCode.trim().toUpperCase() : '';
  const discountCodes = new Map([
    ['EARLYBIRD', 0.1],
    ['STUDENT', 0.15],
    ['LOCAL', 0.12],
  ]);
  const codeRate = discountCodes.get(code) || 0;
  const groupRate = participants >= 8 ? 0.15 : participants >= 4 ? 0.1 : 0;
  const appliedRate = Math.max(codeRate, groupRate);

  return {
    discountCode: code || null,
    discountRate: appliedRate,
    discountReason: appliedRate === 0
      ? null
      : appliedRate === codeRate && code
        ? `Discount code ${code}`
        : 'Group discount',
  };
}

function calculatePriceForTour(tour, participantCount, discountCode) {
  const unitPrice = Math.max(tour.minimumPrice ?? tour.price, tour.price);
  const subtotal = unitPrice * participantCount;
  const discount = calculateDiscount(participantCount, discountCode);
  const discountAmount = Number((subtotal * discount.discountRate).toFixed(2));
  const totalPrice = Number((subtotal - discountAmount).toFixed(2));

  return {
    success: true,
    tourId: tour.id,
    name: tour.name,
    type: tour.type || 'Birdwatching',
    participants: participantCount,
    pricePerPerson: unitPrice,
    subtotal,
    discountRate: discount.discountRate,
    discountAmount,
    discountReason: discount.discountReason,
    totalPrice,
    total: totalPrice,
    currency: DEFAULT_CURRENCY,
  };
}

function isIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getCostaRicaCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function getValidTourDates(tour, { participants = 1, itineraryStartDate, itineraryEndDate } = {}) {
  if (tour.tourType !== 'scheduled') return [];
  return (tour.occurrenceDates || []).filter((occurrence) => (
    occurrence.status === 'scheduled'
    && occurrence.remainingSpaces >= participants
    && (!itineraryStartDate || occurrence.date >= itineraryStartDate)
    && (!itineraryEndDate || occurrence.date <= itineraryEndDate)
  ));
}

function validateTourDate(tour, { date, participants = 1, itineraryStartDate, itineraryEndDate } = {}) {
  if (!date) return {
    success: false,
    code: 'TOUR_DATE_REQUIRED',
    message: 'Choose a specific tour date before continuing.',
    availableDates: getValidTourDates(tour, { participants, itineraryStartDate, itineraryEndDate }),
  };
  if (!isIsoCalendarDate(date)) return {
    success: false,
    code: 'INVALID_TOUR_DATE',
    message: 'Choose a valid calendar date.',
  };
  if ((itineraryStartDate && date < itineraryStartDate) || (itineraryEndDate && date > itineraryEndDate)) {
    return { success: false, code: 'DATE_OUTSIDE_ITINERARY', message: 'The selected date is outside your itinerary.' };
  }
  const availableDates = getValidTourDates(tour, { participants, itineraryStartDate, itineraryEndDate });
  if (tour.tourType === 'scheduled' && !availableDates.some((occurrence) => occurrence.date === date)) {
    return { success: false, code: 'TOUR_DATE_UNAVAILABLE', message: 'That tour is unavailable on the selected date.', availableDates };
  }
  return { success: true, date, availableDates };
}

function toAvailabilityResult(tour, dateValidation = {}) {
  const isScheduled = tour.tourType === 'scheduled';
  return {
    success: true,
    tourId: tour.id,
    name: tour.name,
    location: tour.location,
    pricePerPerson: tour.price,
    availableSlots: isScheduled ? tour.availableSlots : null,
    durationValue: tour.durationValue,
    durationUnit: tour.durationUnit,
    durationHours: tour.durationHours,
    duration: tour.duration,
    difficulty: tour.difficulty,
    type: tour.type || 'Birdwatching',
    tourType: tour.tourType || 'unscheduled',
    maxParticipants: tour.maxParticipants ?? tour.availableSlots,
    minimumPrice: tour.minimumPrice ?? tour.price,
    occurrenceDates: tour.occurrenceDates || [],
    availableDates: dateValidation.availableDates || [],
    selectedDate: dateValidation.date || null,
    requiresDateSelection: !dateValidation.date,
    isAvailable: (isScheduled ? tour.availableSlots > 0 : tour.maxParticipants > 0)
      && dateValidation.success === true,
  };
}

function tourNotFound(selector) {
  return {
    success: false,
    code: 'TOUR_NOT_FOUND',
    message: selector
      ? `Tour ${selector} was not found.`
      : 'Tour was not found.',
  };
}

function ambiguousTourSelection(selector, tours) {
  return {
    success: false,
    code: 'TOUR_SELECTION_AMBIGUOUS',
    message: `I found more than one tour matching ${selector}. Please choose a tour ID.`,
    tours: tours.map(toAvailabilityResult),
  };
}

function generateConfirmationCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `BW-${timestamp}-${suffix}`;
}

class ReservationService {
  async resolveTour({ tourId, tourName, location, participants } = {}) {
    let normalizedTourId;
    let participantCount;

    try {
      if (tourId !== undefined && tourId !== null) {
        normalizedTourId = toPositiveInteger(tourId, 'tourId');
      }

      if (participants !== undefined && participants !== null) {
        participantCount = toPositiveInteger(participants, 'participants');
      }
    } catch (error) {
      return invalidArguments(error);
    }

    const selector = normalizeText(tourName) || normalizeText(location);

    if (normalizedTourId) {
      const tour = await tourQueries.getTourById(normalizedTourId);

      if (!tour) {
        return tourNotFound(normalizedTourId);
      }

      const participantLimitExceeded = participantCount
        && tour.tourType !== 'scheduled'
        && tour.maxParticipants !== undefined
        && tour.maxParticipants !== null
        && tour.maxParticipants < participantCount;
      const scheduledCapacityExceeded = participantCount
        && tour.tourType === 'scheduled'
        && tour.availableSlots < participantCount;
      const scheduledAlreadyStarted = tour.tourType === 'scheduled' && tour.startDate
        && tour.startDate <= getCostaRicaCalendarDate();
      if (tour.isActive === false || participantLimitExceeded
        || scheduledCapacityExceeded || scheduledAlreadyStarted) {
        return {
          success: false,
          code: 'TOUR_UNAVAILABLE',
          message: 'The selected tour is not currently bookable.',
        };
      }

      if (selector && !textMatchesTour(tour, selector)) {
        return {
          success: false,
          code: 'TOUR_SELECTION_MISMATCH',
          message: `Tour ${normalizedTourId} does not match ${selector}. Please confirm the tour ID.`,
          tour: toAvailabilityResult(tour),
        };
      }

      return {
        success: true,
        tour,
      };
    }

    if (!selector) {
      return invalidArguments(new Error('tourId, tourName, or location is required'));
    }

    const tours = await tourQueries.getAvailableTours({ minSlots: participantCount || 1 });

    if (tours.length === 0) {
      return tourNotFound(selector);
    }

    const matchingTours = tours.filter((tour) => textMatchesTour(tour, selector));

    if (matchingTours.length === 0) {
      return tourNotFound(selector);
    }

    if (matchingTours.length > 1) {
      return ambiguousTourSelection(selector, matchingTours);
    }

    return {
      success: true,
      tour: matchingTours[0],
    };
  }

  async checkTourAvailability({
    tourId, tourName, location, participants, date, itineraryStartDate, itineraryEndDate,
  } = {}, metadata = {}) {
    const resolvedTour = await this.resolveTour({
      tourId,
      tourName,
      location,
      participants,
    });

    if (!resolvedTour.success) {
      return resolvedTour;
    }

    const participantCount = participants ? Number(participants) : 1;
    const dateValidation = validateTourDate(resolvedTour.tour, {
      date,
      participants: participantCount,
      itineraryStartDate: itineraryStartDate || metadata.customerContext?.itineraryStartDate,
      itineraryEndDate: itineraryEndDate || metadata.customerContext?.itineraryEndDate,
    });
    const result = toAvailabilityResult(resolvedTour.tour, dateValidation);
    analytics.track({
      userId: metadata.userId,
      anonymousId: metadata.conversationId
        ? `conversation:${metadata.conversationId}`
        : undefined,
      event: ANALYTICS_EVENTS.TOUR_SELECTED,
      idempotencyKey: metadata.conversationId
        ? `${metadata.conversationId}:${result.tourId}`
        : undefined,
      properties: {
        conversationId: metadata.conversationId,
        source: metadata.source || 'chat',
        tourId: result.tourId,
        aiTraceId: metadata.aiTraceId,
        ...getTourRecommendationEventProperties(metadata),
      },
    });
    analytics.track({
      userId: metadata.userId,
      anonymousId: metadata.conversationId
        ? `conversation:${metadata.conversationId}`
        : undefined,
      event: ANALYTICS_EVENTS.AVAILABILITY_CHECKED,
      properties: {
        conversationId: metadata.conversationId,
        source: metadata.source || 'chat',
        tourId: result.tourId,
        participants: participants ? Number(participants) : undefined,
        availabilityResult: result.isAvailable,
        availableSlots: result.availableSlots,
        aiTraceId: metadata.aiTraceId,
      },
    });
    if (dateValidation.code === 'TOUR_DATE_REQUIRED') {
      return {
        ...result,
        success: true,
        isAvailable: false,
        code: dateValidation.code,
        message: dateValidation.message,
      };
    }
    return dateValidation.success ? result : { ...result, ...dateValidation };
  }

  async calculateTourPrice({ tourId, tourName, location, participants, discountCode } = {}) {
    let participantCount;

    try {
      participantCount = toPositiveInteger(participants, 'participants');
    } catch (error) {
      return invalidArguments(error);
    }

    const resolvedTour = await this.resolveTour({
      tourId,
      tourName,
      location,
      participants: participantCount,
    });

    if (!resolvedTour.success) {
      return resolvedTour;
    }

    return calculatePriceForTour(resolvedTour.tour, participantCount, discountCode);
  }

  async createReservation({
    tourId,
    tourName,
    location,
    participants,
    customerName,
    customerEmail,
    discountCode,
    conversationId,
    itineraryStartDate,
    itineraryEndDate,
    date,
  } = {}, metadata = {}) {
    let participantCount;
    let reservationName;

    try {
      participantCount = toPositiveInteger(participants, 'participants');
      reservationName = normalizeCustomerName(customerName);
    } catch (error) {
      return invalidArguments(error);
    }

    const resolvedTour = await this.resolveTour({
      tourId,
      tourName,
      location,
      participants: participantCount,
    });

    if (!resolvedTour.success) {
      return resolvedTour;
    }

    const selectedDate = date || null;
    const dateValidation = validateTourDate(resolvedTour.tour, {
      date: selectedDate,
      participants: participantCount,
      itineraryStartDate: itineraryStartDate || metadata.customerContext?.itineraryStartDate,
      itineraryEndDate: itineraryEndDate || metadata.customerContext?.itineraryEndDate,
    });
    if (!dateValidation.success) return dateValidation;

    const normalizedTourId = resolvedTour.tour.id;
    const discount = calculateDiscount(participantCount, discountCode);
    const normalizedConversationId = normalizeText(conversationId || metadata.conversationId);
    const reservationAttemptKey = normalizedConversationId
      ? `${normalizedConversationId}:${normalizedTourId}:${participantCount}`
      : undefined;

    analytics.track({
      userId: metadata.userId,
      anonymousId: normalizedConversationId
        ? `conversation:${normalizedConversationId}`
        : undefined,
      event: ANALYTICS_EVENTS.RESERVATION_STARTED,
      idempotencyKey: reservationAttemptKey,
      properties: {
        conversationId: normalizedConversationId,
        participants: participantCount,
        plan: metadata.authUser?.plan,
        source: metadata.source || 'chat',
        tourId: normalizedTourId,
        aiTraceId: metadata.aiTraceId,
        ...getTourRecommendationEventProperties(metadata),
      },
    });

    for (let attempt = 1; attempt <= MAX_CONFIRMATION_ATTEMPTS; attempt += 1) {
      const confirmationCode = generateConfirmationCode();

      try {
        const result = await reservationQueries.createReservation({
          tourId: normalizedTourId,
          tourDate: selectedDate,
          participants: participantCount,
          customerName: reservationName,
          customerEmail: normalizeText(customerEmail),
          conversationId: normalizedConversationId,
          confirmationCode,
          discountRate: discount.discountRate,
          userId: metadata.userId,
        });

        if (!result.success) {
          return result;
        }

        const { reservation, tour } = result;

        const reservationResult = buildReservationResult({
          reservation,
          tour: { ...tour, type: resolvedTour.tour.type },
          discount,
          itineraryStartDate: itineraryStartDate || metadata.customerContext?.itineraryStartDate,
          itineraryEndDate: itineraryEndDate || metadata.customerContext?.itineraryEndDate,
        });
        analytics.track({
          userId: metadata.userId,
          anonymousId: normalizedConversationId
            ? `conversation:${normalizedConversationId}`
            : undefined,
          event: ANALYTICS_EVENTS.RESERVATION_COMPLETED,
          idempotencyKey: reservationResult.reservationId,
          properties: {
            conversationId: reservationResult.conversationId,
            plan: metadata.authUser?.plan,
            source: metadata.source || 'chat',
            tourId: reservationResult.tourId,
            participants: reservationResult.participants,
            amount: reservationResult.totalPrice,
            currency: reservationResult.currency,
            aiTraceId: metadata.aiTraceId,
            ...getTourRecommendationEventProperties(metadata),
          },
        });
        return reservationResult;
      } catch (error) {
        if (error.code === '23505' && attempt < MAX_CONFIRMATION_ATTEMPTS) {
          logger.warn('Reservation confirmation code collision; retrying', {
            tourId: normalizedTourId,
            attempt,
          });
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to generate a unique reservation confirmation code');
  }

  async createReservationFromState({ expectedStateVersion } = {}, metadata = {}) {
    const normalizedConversationId = normalizeText(metadata.conversationId);
    const version = Number(expectedStateVersion);

    if (!normalizedConversationId || !Number.isInteger(version) || version < 1) {
      return {
        success: false,
        code: 'RESERVATION_STATE_REQUIRED',
        message: 'The latest confirmed booking details are required before creating a reservation.',
        retryable: false,
      };
    }

    const state = await reservationStateQueries.get(normalizedConversationId, metadata.userId);
    if (!state || (state.status !== 'ready_for_confirmation' && state.status !== 'confirmed')) {
      return {
        success: false,
        code: 'RESERVATION_STATE_NOT_READY',
        message: 'The booking details are incomplete or have not been confirmed.',
        retryable: false,
      };
    }

    const discount = calculateDiscount(state.confirmed.participants, state.confirmed.discountCode);
    const idempotencyKey = `${normalizedConversationId}:${version}`;

    if (!await tourQueries.getTourById(state.confirmed.tourId)) {
      return {
        success: false,
        code: 'TOUR_UNAVAILABLE',
        message: 'The selected tour is not currently bookable.',
        retryable: false,
      };
    }

    for (let attempt = 1; attempt <= MAX_CONFIRMATION_ATTEMPTS; attempt += 1) {
      try {
        const raw = await reservationStateQueries.book({
          conversationId: normalizedConversationId,
          userId: metadata.userId,
          expectedVersion: version,
          confirmationCode: generateConfirmationCode(),
          discountRate: discount.discountRate,
          idempotencyKey,
          sourceType: 'booking_tool',
          sourceId: metadata.aiTraceId || metadata.parentTraceId,
        });

        if (!raw?.success) {
          return {
            success: false,
            code: raw?.code || 'RESERVATION_FAILED',
            message: raw?.message || 'The reservation could not be completed.',
            retryable: false,
            ...(raw?.tour_available_slots !== undefined
              ? { availableSlots: Number(raw.tour_available_slots) }
              : {}),
          };
        }

        const reservation = {
          id: Number(raw.id),
          userId: raw.user_id === null || raw.user_id === undefined ? null : Number(raw.user_id),
          customerName: raw.customer_name,
          customerEmail: raw.customer_email,
          conversationId: raw.conversation_id,
          tourId: Number(raw.tour_id),
          participants: Number(raw.participants),
          confirmationCode: raw.confirmation_code,
          createdAt: raw.created_at,
          totalPrice: Number(raw.total_price),
          tourDate: raw.tour_date ?? state.confirmed.date,
        };
        const tour = {
          name: raw.tour_name,
          availableSlots: Number(raw.tour_available_slots),
        };
        const result = {
          ...buildReservationResult({
            reservation,
            tour,
            discount,
            itineraryStartDate: state.confirmed.itineraryStartDate,
            itineraryEndDate: state.confirmed.itineraryEndDate,
          }),
          stateVersion: Number(raw.state_version),
          idempotent: raw.idempotent === true,
          transferRequired: state.confirmed.transferRequired,
          ...(state.confirmed.pickupLocation
            ? { pickupLocation: state.confirmed.pickupLocation }
            : {}),
        };

        if (!result.idempotent) {
          analytics.track({
            userId: metadata.userId,
            anonymousId: `conversation:${normalizedConversationId}`,
            event: ANALYTICS_EVENTS.RESERVATION_COMPLETED,
            idempotencyKey: result.reservationId,
            properties: {
              conversationId: normalizedConversationId,
              plan: metadata.authUser?.plan,
              source: metadata.source || 'chat',
              tourId: result.tourId,
              participants: result.participants,
              amount: result.totalPrice,
              currency: result.currency,
              aiTraceId: metadata.aiTraceId,
              ...getTourRecommendationEventProperties(metadata),
            },
          });
        }

        return result;
      } catch (error) {
        if (error.code === '23505' && attempt < MAX_CONFIRMATION_ATTEMPTS) continue;
        if (error.code === '40001') {
          return {
            success: false,
            code: 'RESERVATION_STATE_CONFLICT',
            message: 'The booking details changed. Reload the latest details and try again.',
            retryable: true,
          };
        }
        if (error.code === '22023' || error.code === 'P0002') {
          return {
            success: false,
            code: 'RESERVATION_STATE_NOT_READY',
            message: 'The booking details are incomplete, stale, or have not been confirmed.',
            retryable: false,
          };
        }
        throw error;
      }
    }

    throw new Error('Failed to generate a unique reservation confirmation code');
  }

  async getLatestReservationForConversation(conversationId, { userId } = {}) {
    const normalizedConversationId = normalizeText(conversationId);
    const normalizedUserId = userId === undefined || userId === null ? null : Number(userId);

    if (!normalizedConversationId || normalizedUserId === null || Number.isNaN(normalizedUserId)) {
      return null;
    }

    const result = await reservationQueries.getLatestByConversationId(normalizedConversationId, normalizedUserId);

    if (!result?.reservation) {
      return null;
    }

    return buildReservationResult({
      reservation: result.reservation,
      tour: result.tour,
      discount: {
        discountRate: 0,
        discountReason: null,
      },
    });
  }
}

export {
  calculateDiscount,
  calculatePriceForTour,
  generateConfirmationCode,
  invalidArguments,
  toPositiveInteger,
  getValidTourDates,
  isIsoCalendarDate,
  validateTourDate,
};

export default new ReservationService();
