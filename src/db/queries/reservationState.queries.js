import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapState(row) {
  if (!row) return null;

  return {
    conversationId: Number(row.conversation_id),
    version: Number(row.version),
    status: row.status,
    proposed: row.proposed_values || {},
    confirmed: row.confirmed_values || {},
    reservationId: row.reservation_id === null || row.reservation_id === undefined
      ? null
      : Number(row.reservation_id),
    bookingIdempotencyKey: row.booking_idempotency_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ReservationStateQueries {
  async get(conversationId, userId) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_reservation_conversation_state($1, $2)',
        [conversationId, userId ?? null]
      );
      return mapState(result.rows[0]);
    } catch (error) {
      logger.error('Failed to retrieve reservation conversation state', {
        code: error.code,
      });
      throw error;
    }
  }

  async mutate({
    conversationId,
    userId,
    expectedVersion,
    proposed,
    confirmed,
    status,
    eventType,
    changedFields,
    sourceType,
    sourceId,
  }) {
    try {
      const result = await pool.query(
        'SELECT * FROM mutate_reservation_conversation_state($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          conversationId,
          userId ?? null,
          expectedVersion,
          JSON.stringify(proposed || {}),
          JSON.stringify(confirmed || {}),
          status,
          eventType,
          changedFields,
          sourceType,
          sourceId || null,
        ]
      );
      return mapState(result.rows[0]);
    } catch (error) {
      logger.error('Failed to mutate reservation conversation state', {
        expectedVersion,
        code: error.code,
      });
      throw error;
    }
  }

  async book({
    conversationId,
    userId,
    expectedVersion,
    confirmationCode,
    discountRate,
    idempotencyKey,
    sourceType,
    sourceId,
  }) {
    try {
      const result = await pool.query(
        'SELECT book_reservation_from_state($1, $2, $3, $4, $5, $6, $7, $8) AS result',
        [
          conversationId,
          userId ?? null,
          expectedVersion,
          confirmationCode,
          discountRate,
          idempotencyKey,
          sourceType,
          sourceId || null,
        ]
      );
      return result.rows[0]?.result || null;
    } catch (error) {
      logger.error('Failed to book from reservation conversation state', {
        expectedVersion,
        code: error.code,
      });
      throw error;
    }
  }
}

export { mapState };
export default new ReservationStateQueries();
