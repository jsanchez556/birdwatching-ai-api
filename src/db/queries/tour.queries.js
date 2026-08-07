import pool from '../pool.js';
import logger from '../../utils/logger.js';
import { normalizeTourDuration } from '../../utils/tourDuration.utils.js';

function mapTour(row) {
  if (!row) {
    return null;
  }

  const birds = Array.isArray(row.birds) ? row.birds : [];
  const occurrenceDates = Array.isArray(row.occurrence_dates) ? row.occurrence_dates : [];
  const duration = normalizeTourDuration(row);

  return {
    id: Number(row.id),
    country: row.country ?? null,
    name: row.name,
    description: row.description ?? null,
    price: Number(row.price),
    availableSlots: Number(row.available_slots),
    location: row.location,
    node: row.node ?? null,
    subnode: row.subnode ?? null,
    zone: row.zone ?? null,
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    zoneRank: row.zone_rank === null || row.zone_rank === undefined ? null : Number(row.zone_rank),
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lon: row.lon === null || row.lon === undefined ? null : Number(row.lon),
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    birds: birds.map((bird) => ({
      species_code: bird.species_code ?? null,
      name: bird.name,
    })).filter((bird) => bird.name),
    durationValue: duration.durationValue,
    durationUnit: duration.durationUnit,
    durationHours: duration.durationHours,
    difficulty: row.difficulty,
    type: row.type || 'Birdwatching',
    tourType: row.tour_type || 'unscheduled',
    isActive: row.is_active !== false,
    maxParticipants: row.max_participants === null || row.max_participants === undefined
      ? Number(row.available_slots)
      : Number(row.max_participants),
    minimumPrice: row.minimum_price === null || row.minimum_price === undefined
      ? Number(row.price)
      : Number(row.minimum_price),
    occurrenceDates: occurrenceDates.map((occurrence) => ({
      occurrenceId: Number(occurrence.occurrenceId ?? occurrence.occurrence_id),
      startsAt: occurrence.startsAt ?? occurrence.starts_at,
      date: occurrence.date,
      remainingSpaces: Number(occurrence.remainingSpaces ?? occurrence.remaining_spaces),
      status: occurrence.status,
    })),
    imagePath: row.image_path ?? null,
    imageVersion: row.image_updated_at
      ? String(new Date(row.image_updated_at).getTime())
      : null,
  };
}

function mapSelectedTour(row) {
  if (!row) {
    return null;
  }

  if (!row.success) {
    return {
      success: false,
      code: row.code,
      message: row.message,
      ...(row.id ? { tour: mapTour(row) } : {}),
      ...(row.available_slots !== null && row.available_slots !== undefined
        ? { availableSlots: Number(row.available_slots) }
        : {}),
    };
  }

  return {
    success: true,
    message: row.message,
    tour: mapTour(row),
  };
}

export class TourQueries {
  async getTourById(tourId) {
    try {
      const query = `
        SELECT details.*, tours.type, tours.duration_value, tours.duration_unit,
          zone.rank AS zone_rank, tours.image_path, tours.updated_at AS image_updated_at
        FROM get_tour_by_id($1) details
        JOIN tours ON tours.id = details.id
        JOIN node tour_node ON tour_node.id = tours.node_id
        JOIN zone ON zone.id = tour_node.zone_id
        LEFT JOIN users owner ON owner.id = tours.created_by_user_id
        WHERE tours.is_active = true
          AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)`;
      const result = await pool.query(query, [tourId]);
      return mapTour(result.rows[0]);
    } catch (error) {
      logger.error('Failed to retrieve tour', {
        error: error.message,
        tourId,
      });
      throw error;
    }
  }

  async getAvailableTours({
    location,
    difficulty,
    maxPrice,
    minSlots = 1,
    type,
  } = {}) {
    try {
      const query = `
        SELECT available.*, tours.type, tours.duration_value, tours.duration_unit,
          zone.rank AS zone_rank, tours.image_path, tours.updated_at AS image_updated_at
        FROM get_available_tours($1, $2, $3, $4) available
        JOIN tours ON tours.id = available.id
        JOIN node tour_node ON tour_node.id = tours.node_id
        JOIN zone ON zone.id = tour_node.zone_id
        LEFT JOIN users owner ON owner.id = tours.created_by_user_id
        WHERE ($5::text IS NULL OR tours.type = $5)
          AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL)
        ORDER BY zone.rank ASC NULLS LAST, available.rank ASC NULLS LAST, available.id ASC`;
      const result = await pool.query(query, [
        location || null,
        difficulty || null,
        maxPrice ?? null,
        minSlots,
        type || null,
      ]);
      return result.rows.map(mapTour);
    } catch (error) {
      logger.error('Failed to retrieve available tours', {
        error: error.message,
        location,
        difficulty,
        type,
      });
      throw error;
    }
  }

  async selectTour({ tourId, participants = 1 } = {}) {
    try {
      const query = `SELECT selected.* FROM select_tour($1, $2) selected
        LEFT JOIN tours ON tours.id = selected.id
        LEFT JOIN users owner ON owner.id = tours.created_by_user_id
        WHERE selected.id IS NULL OR (tours.is_active = true
          AND (tours.created_by_user_id IS NULL OR owner.suspended_at IS NULL))`;
      const result = await pool.query(query, [tourId, participants]);
      return mapSelectedTour(result.rows[0]);
    } catch (error) {
      logger.error('Failed to select tour', {
        error: error.message,
        tourId,
      });
      throw error;
    }
  }
}

export { mapTour };
export default new TourQueries();
