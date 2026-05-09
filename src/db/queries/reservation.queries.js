import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapReservation(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    conversationId: row.conversation_id,
    tourId: Number(row.tour_id),
    participants: Number(row.participants),
    confirmationCode: row.confirmation_code,
    createdAt: row.created_at,
    totalPrice: Number(row.total_price),
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
  }) {
    try {
      const query = `SELECT * FROM create_tour_reservation($1, $2, $3, $4, $5, $6, $7)`;
      const result = await pool.query(query, [
        tourId,
        participants,
        customerName,
        customerEmail || null,
        conversationId || null,
        confirmationCode,
        discountRate,
      ]);

      const reservationResult = mapReservationFunctionResult(result.rows[0]);

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
}

export default new ReservationQueries();
