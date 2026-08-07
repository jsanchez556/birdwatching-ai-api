import pool from '../pool.js';
import logger from '../../utils/logger.js';
import { normalizeTourDuration } from '../../utils/tourDuration.utils.js';

function durationFields(row) {
  const duration = normalizeTourDuration({
    durationValue: row.tour_duration_value,
    durationUnit: row.tour_duration_unit,
    durationHours: row.tour_duration_hours,
  });
  return {
    durationValue: duration.durationValue,
    durationUnit: duration.durationUnit,
    durationHours: duration.durationHours,
    duration: duration.duration,
  };
}

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
    ...(row.tour_date !== undefined ? { tourDate: row.tour_date ?? null } : {}),
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
      ...durationFields(row),
      difficulty: row.tour_difficulty,
      type: row.tour_activity_type || 'Birdwatching',
      tourType: row.tour_type || 'unscheduled',
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
          ...durationFields(row),
          difficulty: row.tour_difficulty,
          type: row.tour_activity_type || 'Birdwatching',
          tourType: row.tour_type || 'unscheduled',
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
      ...durationFields(row),
      difficulty: row.tour_difficulty,
      type: row.tour_activity_type || 'Birdwatching',
      tourType: row.tour_type || 'unscheduled',
    },
  };
}

export class ReservationQueries {
  async createReservation({
    tourId,
    tourDate,
    participants,
    customerName,
    customerEmail,
    conversationId,
    confirmationCode,
    discountRate = 0,
    userId,
  }) {
    try {
      const query = `
        SELECT create_tour_reservation_for_conversation(
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        ) AS result
      `;
      const parameters = [
        tourId,
        tourDate || null,
        participants,
        customerName,
        customerEmail || null,
        conversationId || null,
        confirmationCode,
        discountRate,
        userId || null,
      ];
      const result = await pool.query(query, parameters);

      const reservationResult = mapReservationFunctionResult(result.rows[0]?.result || result.rows[0]);

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
          c.conversation_code AS conversation_id,
          r.tour_id,
          r.tour_date,
          r.participants,
          r.confirmation_code,
          r.created_at,
          r.total_price,
          t.name AS tour_name,
          GREATEST(t.minimum_price, t.price) AS tour_price,
          COALESCE(o.remaining_spaces, t.max_participants, t.available_slots) AS tour_available_slots,
          t.tour_type,
          t.type AS tour_activity_type,
          COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS tour_location,
          t.duration_hours AS tour_duration_hours,
          t.duration_value AS tour_duration_value,
          t.duration_unit AS tour_duration_unit,
          t.difficulty AS tour_difficulty
        FROM reservations AS r
        INNER JOIN tours AS t ON t.id = r.tour_id
        INNER JOIN conversations AS c ON c.id = r.conversation_id
        LEFT JOIN tour_occurrences AS o ON o.id = r.occurrence_id
        INNER JOIN node AS tour_node ON tour_node.id = t.node_id
        INNER JOIN zone AS z ON z.id = tour_node.zone_id
        LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
        WHERE c.conversation_code = $1
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

  async getLatestByUserId(userId, limit = 5) {
    try {
      const query = `
        SELECT
          r.id,
          r.user_id,
          r.customer_name,
          r.customer_email,
          c.conversation_code AS conversation_id,
          r.tour_id,
          r.participants,
          r.confirmation_code,
          r.created_at,
          r.total_price,
          t.name AS tour_name,
          t.type AS tour_activity_type,
          t.price AS tour_price,
          t.available_slots AS tour_available_slots,
          COALESCE(parent_node.name || ' / ' || tour_node.name, tour_node.name, z.name) AS tour_location,
          t.duration_hours AS tour_duration_hours,
          t.duration_value AS tour_duration_value,
          t.duration_unit AS tour_duration_unit,
          t.difficulty AS tour_difficulty
        FROM reservations AS r
        INNER JOIN tours AS t ON t.id = r.tour_id
        INNER JOIN conversations AS c ON c.id = r.conversation_id
        INNER JOIN node AS tour_node ON tour_node.id = t.node_id
        INNER JOIN zone AS z ON z.id = tour_node.zone_id
        LEFT JOIN node AS parent_node ON parent_node.id = tour_node.parent_id
        WHERE r.user_id = $1
        ORDER BY
          r.created_at DESC,
          r.id DESC
        LIMIT $2
      `;
      const result = await pool.query(query, [userId, limit]);
      return result.rows.map(mapReservationWithTour);
    } catch (error) {
      logger.error('Failed to retrieve latest reservations for user', {
        error: error.message,
      });
      throw error;
    }
  }
}

export default new ReservationQueries();
