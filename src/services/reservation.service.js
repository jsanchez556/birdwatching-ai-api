import { randomBytes } from 'crypto';
import reservationQueries from '../db/queries/reservation.queries.js';
import tourQueries from '../db/queries/tour.queries.js';
import { DEFAULT_CURRENCY } from '../constants/business.js';
import logger from '../utils/logger.js';
import analytics from '../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../analytics/events.js';
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
    participants: reservation.participants,
    confirmationCode: reservation.confirmationCode,
    createdAt: reservation.createdAt,
    totalPrice,
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

  const tourText = [
    tour.name,
    tour.location,
  ]
    .map(normalizeComparableText)
    .filter(Boolean)
    .join(' ');

  if (!tourText) {
    return false;
  }

  if (tourText.includes(selection)) {
    return true;
  }

  const selectionTokens = selection
    .split(/\s+/)
    .filter((token) => token.length > 2);

  return selectionTokens.length > 0
    && selectionTokens.every((token) => tourText.includes(token));
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
  const subtotal = tour.price * participantCount;
  const discount = calculateDiscount(participantCount, discountCode);
  const discountAmount = Number((subtotal * discount.discountRate).toFixed(2));
  const totalPrice = Number((subtotal - discountAmount).toFixed(2));

  return {
    success: true,
    tourId: tour.id,
    name: tour.name,
    participants: participantCount,
    pricePerPerson: tour.price,
    subtotal,
    discountRate: discount.discountRate,
    discountAmount,
    discountReason: discount.discountReason,
    totalPrice,
    total: totalPrice,
    currency: DEFAULT_CURRENCY,
  };
}

function toAvailabilityResult(tour) {
  return {
    success: true,
    tourId: tour.id,
    name: tour.name,
    location: tour.location,
    pricePerPerson: tour.price,
    availableSlots: tour.availableSlots,
    durationHours: tour.durationHours,
    difficulty: tour.difficulty,
    isAvailable: tour.availableSlots > 0,
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

    const tours = await tourQueries.getAvailableTours({
      location: selector,
      minSlots: participantCount || 1,
    });

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

  async checkTourAvailability({ tourId, tourName, location, participants } = {}, metadata = {}) {
    const startedAt = Date.now();
    const resolvedTour = await this.resolveTour({
      tourId,
      tourName,
      location,
      participants,
    });

    if (!resolvedTour.success) {
      return resolvedTour;
    }

    const result = toAvailabilityResult(resolvedTour.tour);
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
        model: metadata.model,
        source: metadata.source || 'chat',
        tourId: result.tourId,
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
        latencyMs: Date.now() - startedAt,
        model: metadata.model,
        source: metadata.source || 'chat',
        tourId: result.tourId,
        participants: participants ? Number(participants) : undefined,
        availabilityResult: result.isAvailable,
        availableSlots: result.availableSlots,
      },
    });
    return result;
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
  } = {}, metadata = {}) {
    const startedAt = Date.now();
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
        latencyMs: Date.now() - startedAt,
        model: metadata.model,
        participants: participantCount,
        plan: metadata.authUser?.plan,
        ragUsed: Number(metadata.ragTrace?.retrievedChunkCount || 0) > 0,
        source: metadata.source || 'chat',
        tourId: normalizedTourId,
      },
    });

    for (let attempt = 1; attempt <= MAX_CONFIRMATION_ATTEMPTS; attempt += 1) {
      const confirmationCode = generateConfirmationCode();

      try {
        const result = await reservationQueries.createReservation({
          tourId: normalizedTourId,
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
          tour,
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
            latencyMs: Date.now() - startedAt,
            model: metadata.model,
            plan: metadata.authUser?.plan,
            ragUsed: Number(metadata.ragTrace?.retrievedChunkCount || 0) > 0,
            source: metadata.source || 'chat',
            tourId: reservationResult.tourId,
            participants: reservationResult.participants,
            amount: reservationResult.totalPrice,
            currency: reservationResult.currency,
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
};

export default new ReservationService();
