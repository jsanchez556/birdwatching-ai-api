import cartQueries from '../db/queries/cart.queries.js';
import reservationQueries from '../db/queries/reservation.queries.js';
import reservationService from './reservation.service.js';
import HttpError from '../utils/httpError.js';
import { normalizeText } from '../utils/normalizers.js';

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertDateRange(startDate, endDate) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    throw new HttpError(422, 'A valid itinerary date range is required', {
      code: 'VALIDATION_ERROR',
    });
  }
}

function assertScheduledDate(settings, scheduledDate) {
  if (!scheduledDate) return;

  if (!isIsoDate(scheduledDate)) {
    throw new HttpError(422, 'Scheduled date must use YYYY-MM-DD format', {
      code: 'VALIDATION_ERROR',
    });
  }

  if (
    settings.itineraryStartDate
    && settings.itineraryEndDate
    && (scheduledDate < settings.itineraryStartDate || scheduledDate > settings.itineraryEndDate)
  ) {
    throw new HttpError(422, 'Scheduled date must be inside the itinerary range', {
      code: 'VALIDATION_ERROR',
    });
  }
}

function toPositiveInteger(value, fieldName) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new HttpError(422, `${fieldName} must be a positive integer`, {
      code: 'VALIDATION_ERROR',
    });
  }

  return normalized;
}

function isOneTourPerDayConflict(error) {
  return error?.code === '23505' && /tour_cart_one_tour_per_day/.test(error.constraint || '');
}

function shapeCart(cart) {
  return {
    itineraryStartDate: cart.settings.itineraryStartDate,
    itineraryEndDate: cart.settings.itineraryEndDate,
    items: cart.items,
    count: cart.items.length,
  };
}

function shapeReservationHistoryItem({ reservation, tour }) {
  return {
    id: reservation.id,
    userId: reservation.userId,
    customerName: reservation.customerName,
    customerEmail: reservation.customerEmail,
    conversationId: reservation.conversationId,
    tourId: reservation.tourId,
    tourName: tour.name,
    participants: reservation.participants,
    confirmationCode: reservation.confirmationCode,
    createdAt: reservation.createdAt,
    totalPrice: reservation.totalPrice,
    tour,
  };
}

class CartService {
  async getCart(userId) {
    return shapeCart(await cartQueries.getCart(userId));
  }

  async addItem(userId, body = {}) {
    const tourId = toPositiveInteger(body.tourId, 'tourId');
    const participants = body.participants === undefined
      ? 1
      : toPositiveInteger(body.participants, 'participants');
    const cart = await cartQueries.getCart(userId);

    assertScheduledDate(cart.settings, body.scheduledDate);

    try {
      return await cartQueries.addItem({
        userId,
        tourId,
        scheduledDate: body.scheduledDate || null,
        participants,
        needsTransportation: body.needsTransportation,
        metadata: body.metadata,
      });
    } catch (error) {
      if (isOneTourPerDayConflict(error)) {
        throw new HttpError(422, 'Only one tour can be added per itinerary day', {
          code: 'VALIDATION_ERROR',
        });
      }

      throw error;
    }
  }

  async updateItem(userId, itemId, body = {}) {
    const cart = await cartQueries.getCart(userId);
    assertScheduledDate(cart.settings, body.scheduledDate);

    let item;

    try {
      item = await cartQueries.updateItem({
        userId,
        itemId: toPositiveInteger(itemId, 'itemId'),
        scheduledDate: body.scheduledDate,
        participants: body.participants === undefined ? undefined : toPositiveInteger(body.participants, 'participants'),
        needsTransportation: body.needsTransportation,
      });
    } catch (error) {
      if (isOneTourPerDayConflict(error)) {
        throw new HttpError(422, 'Only one tour can be added per itinerary day', {
          code: 'VALIDATION_ERROR',
        });
      }

      throw error;
    }

    if (!item) {
      throw new HttpError(404, 'Cart item was not found', { code: 'NOT_FOUND' });
    }

    return item;
  }

  async removeItem(userId, itemId) {
    const removed = await cartQueries.removeItem({
      userId,
      itemId: toPositiveInteger(itemId, 'itemId'),
    });

    if (!removed) {
      throw new HttpError(404, 'Cart item was not found', { code: 'NOT_FOUND' });
    }

    return { removed: true };
  }

  async getLatestReservations(userId) {
    const reservations = await reservationQueries.getLatestByUserId(userId, 5);
    return reservations.map(shapeReservationHistoryItem);
  }

  async createReservations(user, { conversationId, itemIds } = {}) {
    const cart = await cartQueries.getCart(user.id);
    assertDateRange(cart.settings.itineraryStartDate, cart.settings.itineraryEndDate);

    if (!cart.items.length) {
      throw new HttpError(422, 'Cart is empty', { code: 'VALIDATION_ERROR' });
    }

    const selectedItemIds = Array.isArray(itemIds) && itemIds.length > 0
      ? new Set(itemIds.map(Number))
      : null;
    const selectedItems = selectedItemIds
      ? cart.items.filter((item) => selectedItemIds.has(item.id))
      : cart.items;

    if (selectedItemIds && selectedItems.length !== selectedItemIds.size) {
      throw new HttpError(404, 'Cart item was not found', { code: 'NOT_FOUND' });
    }

    const seenDates = new Set();
    const missingDate = selectedItems.find((item) => !item.scheduledDate);

    if (missingDate) {
      throw new HttpError(422, 'Every cart tour needs an itinerary date', {
        code: 'VALIDATION_ERROR',
      });
    }

    for (const item of selectedItems) {
      if (seenDates.has(item.scheduledDate)) {
        throw new HttpError(422, 'Only one tour can be reserved per itinerary day', {
          code: 'VALIDATION_ERROR',
        });
      }

      seenDates.add(item.scheduledDate);
    }

    const reservations = [];

    for (const item of selectedItems) {
      const reservation = await reservationService.createReservation({
        tourId: item.tourId,
        participants: item.participants,
        customerName: user.name || user.email,
        customerEmail: user.email,
        conversationId,
        itineraryStartDate: item.scheduledDate,
        itineraryEndDate: item.scheduledDate,
      }, {
        userId: user.id,
        conversationId,
        selectedTransportation: item.needsTransportation ? item.metadata?.selectedTransportation : null,
        customerContext: {
          customerName: normalizeText(user.name || user.email),
          customerEmail: user.email,
          itineraryStartDate: item.scheduledDate,
          itineraryEndDate: item.scheduledDate,
        },
      });

      if (!reservation?.success) {
        throw new HttpError(409, reservation?.message || 'Unable to create reservation from cart', {
          code: reservation?.code || 'RESERVATION_FAILED',
        });
      }

      reservations.push(reservation);
    }

    if (selectedItemIds) {
      await cartQueries.removeItemsByIds({
        userId: user.id,
        itemIds: Array.from(selectedItemIds),
      });
    } else {
      await cartQueries.clearCart(user.id);
    }

    return {
      reservations,
      count: reservations.length,
    };
  }
}

export default new CartService();
