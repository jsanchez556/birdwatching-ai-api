import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapTour(row) {
  if (!row) {
    return null;
  }

  const birds = Array.isArray(row.birds) ? row.birds : [];

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
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lon: row.lon === null || row.lon === undefined ? null : Number(row.lon),
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    birds: birds.map((bird) => ({
      species_code: bird.species_code ?? null,
      name: bird.name,
    })).filter((bird) => bird.name),
    durationHours: Number(row.duration_hours),
    difficulty: row.difficulty,
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
      const query = `SELECT * FROM get_tour_by_id($1)`;
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
  } = {}) {
    try {
      const query = `SELECT * FROM get_available_tours($1, $2, $3, $4)`;
      const result = await pool.query(query, [
        location || null,
        difficulty || null,
        maxPrice ?? null,
        minSlots,
      ]);
      return result.rows.map(mapTour);
    } catch (error) {
      logger.error('Failed to retrieve available tours', {
        error: error.message,
        location,
        difficulty,
      });
      throw error;
    }
  }

  async selectTour({ tourId, participants = 1 } = {}) {
    try {
      const query = `SELECT * FROM select_tour($1, $2)`;
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
