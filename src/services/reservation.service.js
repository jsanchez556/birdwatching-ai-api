import { randomBytes } from 'crypto';
import reservationQueries from '../db/queries/reservation.queries.js';
import tourQueries from '../db/queries/tour.queries.js';
import logger from '../utils/logger.js';

const MAX_CONFIRMATION_ATTEMPTS = 3;

function invalidArguments(error) {
  return {
    success: false,
    code: 'INVALID_TOOL_ARGUMENTS',
    message: error.message,
  };
}

function toPositiveInteger(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numberValue;
}

function normalizeCustomerName(customerName) {
  const reservationName = typeof customerName === 'string' ? customerName.trim() : '';

  if (!reservationName) {
    throw new Error('customerName is required');
  }

  return reservationName;
}

function normalizeCustomerEmail(customerEmail) {
  return typeof customerEmail === 'string' && customerEmail.trim()
    ? customerEmail.trim()
    : null;
}

function normalizeConversationId(conversationId) {
  return typeof conversationId === 'string' && conversationId.trim()
    ? conversationId.trim()
    : null;
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
    currency: 'USD',
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

function generateConfirmationCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `BW-${timestamp}-${suffix}`;
}

class ReservationService {
  async checkTourAvailability({ tourId } = {}) {
    let normalizedTourId;

    try {
      normalizedTourId = toPositiveInteger(tourId, 'tourId');
    } catch (error) {
      return invalidArguments(error);
    }

    const tour = await tourQueries.getTourById(normalizedTourId);

    if (!tour) {
      return {
        success: false,
        code: 'TOUR_NOT_FOUND',
        message: `Tour ${tourId} was not found.`,
      };
    }

    return toAvailabilityResult(tour);
  }

  async calculateTourPrice({ tourId, participants, discountCode } = {}) {
    let normalizedTourId;
    let participantCount;

    try {
      normalizedTourId = toPositiveInteger(tourId, 'tourId');
      participantCount = toPositiveInteger(participants, 'participants');
    } catch (error) {
      return invalidArguments(error);
    }

    const tour = await tourQueries.getTourById(normalizedTourId);

    if (!tour) {
      return {
        success: false,
        code: 'TOUR_NOT_FOUND',
        message: `Tour ${tourId} was not found.`,
      };
    }

    return calculatePriceForTour(tour, participantCount, discountCode);
  }

  async createReservation({
    tourId,
    participants,
    customerName,
    customerEmail,
    discountCode,
    conversationId,
  } = {}, metadata = {}) {
    let normalizedTourId;
    let participantCount;
    let reservationName;

    try {
      normalizedTourId = toPositiveInteger(tourId, 'tourId');
      participantCount = toPositiveInteger(participants, 'participants');
      reservationName = normalizeCustomerName(customerName);
    } catch (error) {
      return invalidArguments(error);
    }

    const discount = calculateDiscount(participantCount, discountCode);

    for (let attempt = 1; attempt <= MAX_CONFIRMATION_ATTEMPTS; attempt += 1) {
      const confirmationCode = generateConfirmationCode();

      try {
        const result = await reservationQueries.createReservation({
          tourId: normalizedTourId,
          participants: participantCount,
          customerName: reservationName,
          customerEmail: normalizeCustomerEmail(customerEmail),
          conversationId: normalizeConversationId(conversationId || metadata.conversationId),
          confirmationCode,
          discountRate: discount.discountRate,
        });

        if (!result.success) {
          return result;
        }

        const { reservation, tour } = result;

        return {
          success: true,
          id: reservation.id,
          reservationId: reservation.id,
          customer_name: reservation.customerName,
          customerName: reservation.customerName,
          customerEmail: reservation.customerEmail,
          conversationId: reservation.conversationId,
          tour_id: reservation.tourId,
          tourId: reservation.tourId,
          tourName: tour.name,
          participants: reservation.participants,
          confirmation_code: reservation.confirmationCode,
          confirmationCode: reservation.confirmationCode,
          created_at: reservation.createdAt,
          createdAt: reservation.createdAt,
          total_price: reservation.totalPrice,
          totalPrice: reservation.totalPrice,
          currency: 'USD',
          remainingSlots: tour.availableSlots,
          discountRate: discount.discountRate,
          discountReason: discount.discountReason,
        };
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
}

export {
  calculateDiscount,
  calculatePriceForTour,
  generateConfirmationCode,
  invalidArguments,
  toPositiveInteger,
};

export default new ReservationService();
