import pool from '../pool.js';
import logger from '../../utils/logger.js';
import { normalizeTourDuration } from '../../utils/tourDuration.utils.js';

function mapCartItem(row) {
  if (!row) return null;
  const duration = normalizeTourDuration({
    durationValue: row.tour_duration_value,
    durationUnit: row.tour_duration_unit,
    durationHours: row.tour_duration_hours,
  });

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tourId: Number(row.tour_id),
    scheduledDate: formatDate(row.scheduled_date),
    participants: Number(row.participants),
    needsTransfer: row.needs_transfer,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tour: {
      id: Number(row.tour_id),
      name: row.tour_name,
      description: row.tour_description,
      pricePerPerson: Number(row.tour_price),
      availableSlots: Number(row.tour_available_slots),
      location: row.tour_location,
      node: row.tour_node,
      subnode: row.tour_subnode,
      zone: row.tour_zone,
      durationHours: Number(row.tour_duration_hours),
      durationValue: duration.durationValue,
      durationUnit: duration.durationUnit,
      duration: duration.duration,
      difficulty: row.tour_difficulty,
      type: row.tour_activity_type || 'Birdwatching',
      tourType: row.tour_type || 'unscheduled',
    },
  };
}

function mapSettings(row) {
  return {
    itineraryStartDate: formatDate(row?.itinerary_start_date),
    itineraryEndDate: formatDate(row?.itinerary_end_date),
  };
}

function formatDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export class CartQueries {
  async getCart(userId) {
    try {
      const itemsResult = await pool.query(
        `SELECT items.*, tours.type AS tour_activity_type, tours.tour_type,
           tours.duration_value AS tour_duration_value, tours.duration_unit AS tour_duration_unit
         FROM get_tour_cart_items($1) items JOIN tours ON tours.id = items.tour_id
         LEFT JOIN users owner ON owner.id = tours.created_by_user_id
         WHERE tours.is_active = true
           AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)`,
        [userId]
      );

      return {
        settings: mapSettings(),
        items: itemsResult.rows.map(mapCartItem),
      };
    } catch (error) {
      logger.error('Failed to retrieve cart', { error: error.message });
      throw error;
    }
  }

  async addItem({ userId, tourId, scheduledDate = null, participants = 1, needsTransfer = null, metadata = {} }) {
    const result = await pool.query(`
      SELECT item.*, tours.type AS tour_activity_type, tours.tour_type,
        tours.duration_value AS tour_duration_value, tours.duration_unit AS tour_duration_unit
      FROM upsert_tour_cart_item($1, $2, $3, $4, $5, $6::jsonb) item
      JOIN tours ON tours.id = item.tour_id
      LEFT JOIN users owner ON owner.id = tours.created_by_user_id
      WHERE tours.is_active = true
        AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)`, [
      userId,
      tourId,
      scheduledDate,
      participants,
      needsTransfer,
      JSON.stringify(metadata || {}),
    ]);

    return mapCartItem(result.rows[0]);
  }

  async updateItem({ userId, itemId, scheduledDate, participants, needsTransfer }) {
    const result = await pool.query(
      `SELECT item.*, tours.type AS tour_activity_type, tours.tour_type,
         tours.duration_value AS tour_duration_value, tours.duration_unit AS tour_duration_unit
       FROM update_tour_cart_item($1, $2, $3, $4, $5) item
       JOIN tours ON tours.id = item.tour_id
       LEFT JOIN users owner ON owner.id = tours.created_by_user_id
       WHERE tours.is_active = true
         AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)`,
      [userId, itemId, scheduledDate || null, participants || null, needsTransfer]
    );

    if (!result.rows[0]) return null;
    return mapCartItem(result.rows[0]);
  }

  async removeItem({ userId, itemId }) {
    const result = await pool.query(
      'SELECT delete_tour_cart_item($1, $2) AS removed',
      [userId, itemId]
    );

    return Boolean(result.rows[0]?.removed);
  }

  async clearCart(userId) {
    await pool.query('SELECT clear_tour_cart($1)', [userId]);
  }

  async removeItemsByIds({ userId, itemIds }) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return;

    await pool.query(
      'SELECT delete_tour_cart_items_by_ids($1, $2::int[])',
      [userId, itemIds]
    );
  }

  async getItemById({ userId, itemId }) {
    const result = await pool.query(`
      SELECT item.*, tours.type AS tour_activity_type, tours.tour_type,
        tours.duration_value AS tour_duration_value, tours.duration_unit AS tour_duration_unit
      FROM get_tour_cart_item_by_id($1, $2) item JOIN tours ON tours.id = item.tour_id
      LEFT JOIN users owner ON owner.id = tours.created_by_user_id
      WHERE tours.is_active = true
        AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)`, [userId, itemId]);
    return mapCartItem(result.rows[0]);
  }
}

export default new CartQueries();
