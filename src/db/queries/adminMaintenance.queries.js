import pool from '../pool.js';
import { tourImageVersionFromDate } from '../../utils/tourImage.utils.js';

const LIST_SQL = Object.freeze({
  countries: `
    SELECT id, name, acr, latitude, longitude, zoom,
      COUNT(*) OVER() AS total_count
    FROM country
    WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR acr ILIKE '%' || $1 || '%')
    ORDER BY name, id LIMIT $2 OFFSET $3`,
  zones: `
    SELECT z.id, z.country_id, c.name AS country_name, z.name, z.des, z.rank, z.is_active,
      COUNT(*) OVER() AS total_count
    FROM zone z JOIN country c ON c.id = z.country_id
    WHERE ($1 = '' OR z.name ILIKE '%' || $1 || '%' OR z.des ILIKE '%' || $1 || '%')
      AND ($4::integer IS NULL OR z.country_id = $4)
    ORDER BY c.name, z.rank, z.name, z.id LIMIT $2 OFFSET $3`,
  nodes: `
    SELECT n.id, n.parent_id, parent.name AS parent_name, n.zone_id, z.country_id,
      z.name AS zone_name, n.name, n.rank, n.lat, n.lon, n.des, n.is_active,
      COUNT(*) OVER() AS total_count
    FROM node n JOIN zone z ON z.id = n.zone_id LEFT JOIN node parent ON parent.id = n.parent_id
    WHERE ($1 = '' OR n.name ILIKE '%' || $1 || '%' OR n.des ILIKE '%' || $1 || '%')
      AND ($4::integer IS NULL OR z.country_id = $4)
      AND ($5::integer IS NULL OR n.zone_id = $5)
    ORDER BY z.name, n.rank, n.name, n.id LIMIT $2 OFFSET $3`,
  birds: `
    SELECT b.id, b.species_code, b.name, b.tags, b.is_active, COUNT(*) OVER() AS total_count
    FROM birds b
    WHERE ($1 = '' OR b.name ILIKE '%' || $1 || '%' OR b.species_code ILIKE '%' || $1 || '%'
      OR array_to_string(b.tags, ' ') ILIKE '%' || $1 || '%')
    ORDER BY b.name, b.id LIMIT $2 OFFSET $3`,
  'birds-by-node': `
    SELECT bbn.node_id, n.name AS node_name, bbn.bird_id, b.name AS bird_name,
      b.species_code, bbn.rank, bbn.is_active, COUNT(*) OVER() AS total_count
    FROM birds_by_node bbn JOIN node n ON n.id = bbn.node_id JOIN birds b ON b.id = bbn.bird_id
    WHERE ($1 = '' OR n.name ILIKE '%' || $1 || '%' OR b.name ILIKE '%' || $1 || '%'
      OR b.species_code ILIKE '%' || $1 || '%')
      AND ($4::integer IS NULL OR bbn.node_id = $4)
    ORDER BY n.name, bbn.rank, b.name LIMIT $2 OFFSET $3`,
  tours: `
    SELECT t.id, t.node_id, n.name AS node_name, z.id AS zone_id, z.name AS zone_name,
      c.id AS country_id, c.name AS country_name, t.name, t.description, t.type,
      t.price, t.available_slots, t.duration_hours, t.duration_value, t.duration_unit,
      t.difficulty, t.lat, t.lon,
      t.start_date, t.end_date, t.source_url, t.tour_type, t.is_active,
      t.max_participants, t.minimum_price, t.created_by_user_id, t.image_path,
      owner.name AS owner_name, owner.email AS owner_email,
      CASE WHEN t.created_by_user_id IS NULL THEN 'legacy'
        WHEN owner.suspended_at IS NULL THEN 'active' ELSE 'suspended' END AS owner_status,
      t.created_at, t.updated_at,
      COUNT(*) OVER() AS total_count
    FROM tours t JOIN node n ON n.id = t.node_id JOIN zone z ON z.id = n.zone_id
      JOIN country c ON c.id = z.country_id
      LEFT JOIN users owner ON owner.id = t.created_by_user_id
    WHERE ($1 = '' OR t.name ILIKE '%' || $1 || '%' OR t.description ILIKE '%' || $1 || '%'
      OR t.type ILIKE '%' || $1 || '%' OR n.name ILIKE '%' || $1 || '%'
      OR z.name ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%'
      OR owner.name ILIKE '%' || $1 || '%' OR owner.email ILIKE '%' || $1 || '%')
      AND ($4::integer IS NULL OR c.id = $4)
      AND ($5::integer IS NULL OR z.id = $5)
      AND ($6::integer IS NULL OR n.id = $6)
      AND ($7::text IS NULL OR t.type = $7)
      AND ($8::integer IS NULL OR t.created_by_user_id = $8)
      AND ($9::boolean IS NULL OR t.is_active = $9)
      AND ($10::text IS NULL OR lower(t.difficulty) = lower($10))
    ORDER BY t.updated_at DESC, t.id DESC LIMIT $2 OFFSET $3`,
});

const GET_SQL = Object.freeze({
  countries: 'SELECT * FROM country WHERE id = $1',
  zones: 'SELECT * FROM zone WHERE id = $1',
  nodes: 'SELECT * FROM node WHERE id = $1',
  birds: 'SELECT * FROM birds WHERE id = $1',
  tours: `SELECT t.*, n.name AS node_name, z.id AS zone_id, z.name AS zone_name,
    c.id AS country_id, c.name AS country_name, owner.name AS owner_name,
    owner.email AS owner_email, CASE WHEN t.created_by_user_id IS NULL THEN 'legacy'
      WHEN owner.suspended_at IS NULL THEN 'active' ELSE 'suspended' END AS owner_status
    FROM tours t JOIN node n ON n.id = t.node_id JOIN zone z ON z.id = n.zone_id
    JOIN country c ON c.id = z.country_id LEFT JOIN users owner ON owner.id = t.created_by_user_id
    WHERE t.id = $1`,
});

const FUNCTION_STEMS = Object.freeze({
  countries: 'country', zones: 'zone', nodes: 'node', birds: 'bird',
  'birds-by-node': 'bird_by_node', tours: 'tour',
});

function buildListParameters(resource, filters) {
  const base = [filters.search, filters.limit, filters.offset];
  const byResource = {
    countries: base,
    zones: [...base, filters.countryId || null],
    nodes: [...base, filters.countryId || null, filters.zoneId || null],
    birds: base,
    'birds-by-node': [...base, filters.nodeId || null],
    tours: [
      ...base,
      filters.countryId || null,
      filters.zoneId || null,
      filters.nodeId || null,
      filters.type || null,
      filters.ownerId || null,
      filters.isActive ?? null,
      filters.difficulty || null,
    ],
  };
  return byResource[resource];
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function mapEntity(resource, row) {
  if (!row) return null;
  const mapped = Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== 'total_count')
    .map(([key, value]) => [snakeToCamel(key), value]));
  if ((resource === 'zones' || resource === 'nodes') && mapped.description === undefined) {
    mapped.description = mapped.des || '';
    delete mapped.des;
  }
  if (resource === 'birds-by-node') mapped.id = `${mapped.nodeId}:${mapped.birdId}`;
  for (const key of ['id', 'countryId', 'zoneId', 'nodeId', 'parentId', 'birdId', 'rank',
    'availableSlots', 'durationHours', 'durationValue', 'maxParticipants', 'createdByUserId']) {
    if (mapped[key] !== null && mapped[key] !== undefined) mapped[key] = Number(mapped[key]);
  }
  for (const key of ['latitude', 'longitude', 'zoom', 'lat', 'lon',
    'price', 'minimumPrice']) {
    if (mapped[key] !== null && mapped[key] !== undefined) mapped[key] = Number(mapped[key]);
  }
  if (resource === 'tours' && mapped.imagePath) {
    mapped.imageVersion = tourImageVersionFromDate(mapped.updatedAt) || null;
  }
  return mapped;
}

function parseCompositeId(value) {
  const match = String(value).match(/^(\d+):(\d+)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

class AdminMaintenanceQueries {
  async list(resource, {
    search = '', limit, offset, countryId, zoneId, nodeId, type, ownerId, isActive, difficulty,
  } = {}) {
    const parameters = buildListParameters(resource, {
      search, limit, offset, countryId, zoneId, nodeId, type, ownerId, isActive, difficulty,
    });
    const result = await pool.query(LIST_SQL[resource], parameters);
    return {
      rows: result.rows.map((row) => mapEntity(resource, row)),
      total: Number(result.rows[0]?.total_count || 0),
    };
  }

  async getById(resource, id) {
    if (resource === 'birds-by-node') {
      const parts = parseCompositeId(id);
      if (!parts) return null;
      const result = await pool.query(`
        SELECT bbn.*, n.name AS node_name, b.name AS bird_name, b.species_code
        FROM birds_by_node bbn JOIN node n ON n.id = bbn.node_id
          JOIN birds b ON b.id = bbn.bird_id
        WHERE bbn.node_id = $1 AND bbn.bird_id = $2`, parts);
      return mapEntity(resource, result.rows[0]);
    }
    const result = await pool.query(GET_SQL[resource], [id]);
    return mapEntity(resource, result.rows[0]);
  }

  async create(resource, data) {
    const result = await pool.query(
      `SELECT admin_create_${FUNCTION_STEMS[resource]}($1::jsonb) AS entity`,
      [JSON.stringify(data)]
    );
    return mapEntity(resource, result.rows[0]?.entity);
  }

  async update(resource, id, data) {
    let query;
    let values;
    if (resource === 'birds-by-node') {
      const parts = parseCompositeId(id);
      if (!parts) return null;
      query = 'SELECT admin_update_bird_by_node($1, $2, $3::jsonb) AS entity';
      values = [...parts, JSON.stringify(data)];
    } else {
      query = `SELECT admin_update_${FUNCTION_STEMS[resource]}($1, $2::jsonb) AS entity`;
      values = [id, JSON.stringify(data)];
    }
    const result = await pool.query(query, values);
    return mapEntity(resource, result.rows[0]?.entity);
  }

  async setTourImagePath(id, imagePath) {
    const result = await pool.query(
      'SELECT admin_set_tour_image_path($1, $2) AS entity',
      [id, imagePath]
    );
    return mapEntity('tours', result.rows[0]?.entity);
  }

  async remove(resource, id) {
    let query;
    let values;
    if (resource === 'birds-by-node') {
      const parts = parseCompositeId(id);
      if (!parts) return null;
      query = 'SELECT admin_delete_bird_by_node($1, $2) AS entity';
      values = parts;
    } else {
      query = `SELECT admin_delete_${FUNCTION_STEMS[resource]}($1) AS entity`;
      values = [id];
    }
    const result = await pool.query(query, values);
    return mapEntity(resource, result.rows[0]?.entity);
  }
}

export { LIST_SQL, buildListParameters, mapEntity, parseCompositeId };
export default new AdminMaintenanceQueries();
