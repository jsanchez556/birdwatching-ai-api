import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapReservation(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    userId: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    conversationId: row.conversation_id,
    tourId: Number(row.tour_id),
    participants: Number(row.participants),
    confirmationCode: row.confirmation_code,
    createdAt: row.created_at,
    totalPrice: Number(row.total_price),
    metadata: row.metadata || {},
  };
}

function mapReservationWithTour(row) {
  if (!row) {
    return null;
  }

  return {
    reservation: mapReservation(row),
    tour: {
      id: Number(row.tour_id),
      name: row.tour_name,
      price: Number(row.tour_price),
      availableSlots: Number(row.tour_available_slots),
      location: row.tour_location,
      durationHours: Number(row.tour_duration_hours),
      difficulty: row.tour_difficulty,
    },
  };
}

function mapReservationFunctionResult(row) {
  if (!row) {
    return null;
  }

  if (!row.success) {
    return {
      success: false,
      code: row.code,
      message: row.message,
      ...(row.tour_id ? {
        tour: {
          id: Number(row.tour_id),
          name: row.tour_name,
          price: Number(row.tour_price),
          availableSlots: Number(row.tour_available_slots),
          location: row.tour_location,
          durationHours: Number(row.tour_duration_hours),
          difficulty: row.tour_difficulty,
        },
        requestedParticipants: Number(row.participants),
        availableSlots: Number(row.tour_available_slots),
      } : {}),
    };
  }

  return {
    success: true,
    reservation: mapReservation(row),
    tour: {
      id: Number(row.tour_id),
      name: row.tour_name,
      price: Number(row.tour_price),
      availableSlots: Number(row.tour_available_slots),
      location: row.tour_location,
      durationHours: Number(row.tour_duration_hours),
      difficulty: row.tour_difficulty,
    },
  };
}

export class ReservationQueries {
  async createReservation({
    tourId,
    participants,
    customerName,
    customerEmail,
    conversationId,
    confirmationCode,
    discountRate = 0,
    userId,
    metadata = {},
  }) {
    try {
      const query = `SELECT * FROM create_tour_reservation($1, $2, $3, $4, $5, $6, $7, $8)`;
      const result = await pool.query(query, [
        tourId,
        participants,
        customerName,
        customerEmail || null,
        conversationId || null,
        confirmationCode,
        discountRate,
        userId || null,
      ]);

      const reservationResult = mapReservationFunctionResult(result.rows[0]);

      if (reservationResult?.success && Object.keys(metadata || {}).length > 0) {
        reservationResult.reservation.metadata = metadata;
      }

      if (reservationResult?.success) {
        logger.info('Reservation persisted', {
          id: reservationResult.reservation.id,
          tourId,
          participants,
          confirmationCode,
          remainingSlots: reservationResult.tour.availableSlots,
        });
      }

      return reservationResult;
    } catch (error) {
      logger.error('Failed to create reservation', {
        error: error.message,
        tourId,
      });
      throw error;
    }
  }

  async getLatestByConversationId(conversationId, userId) {
    try {
      const query = `
        SELECT
          r.id,
          r.user_id,
          r.customer_name,
          r.customer_email,
          r.conversation_id,
          r.tour_id,
          r.participants,
          r.confirmation_code,
          r.created_at,
          r.total_price,
          '{}'::jsonb AS metadata,
          t.name AS tour_name,
          t.price AS tour_price,
          t.available_slots AS tour_available_slots,
          t.location AS tour_location,
          t.duration_hours AS tour_duration_hours,
          t.difficulty AS tour_difficulty
        FROM reservations AS r
        INNER JOIN tours AS t ON t.id = r.tour_id
        INNER JOIN conversations AS c ON c.conversation_id = r.conversation_id
        WHERE r.conversation_id = $1
          AND c.user_id = $2
          AND (r.user_id IS NULL OR r.user_id = $2)
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1
      `;
      const result = await pool.query(query, [conversationId, userId]);
      return mapReservationWithTour(result.rows[0]);
    } catch (error) {
      logger.error('Failed to retrieve latest reservation for conversation', {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  }
}

export default new ReservationQueries();
