import adminMaintenanceQueries from '../../db/queries/adminMaintenance.queries.js';
import { ADMIN_MAINTENANCE_RESOURCES } from '../../api/validators/adminMaintenance.validator.js';
import { normalizeTourType, TOUR_TYPES } from '../../constants/tourTypes.js';
import HttpError from '../../utils/httpError.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const RESOURCE_SET = new Set(ADMIN_MAINTENANCE_RESOURCES);

function databaseError(error) {
  if (error?.code === '23503') return new HttpError(409, 'This record is still referenced and cannot be removed.', { code: 'REFERENTIAL_INTEGRITY_CONFLICT' });
  if (error?.code === '23505') return new HttpError(409, 'A record with those values already exists.', { code: 'DUPLICATE_RECORD' });
  if (['23514', '22P02', '22007'].includes(error?.code)) return new HttpError(422, 'The record contains invalid values.', { code: 'VALIDATION_ERROR' });
  return error;
}

function positiveInteger(value, fallback, maximum = Infinity) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > maximum) {
    throw new HttpError(400, 'Invalid pagination or filter value.', { code: 'VALIDATION_ERROR' });
  }
  return number;
}

function normalizeListQuery(resource, query = {}) {
  const allowed = new Set(['search', 'page', 'limit', 'countryId', 'zoneId', 'nodeId', 'type', 'status', 'difficulty']);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'Unknown maintenance query parameter.', { code: 'VALIDATION_ERROR' });
  }
  const page = positiveInteger(query.page, 1);
  const limit = positiveInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const type = query.type ? normalizeTourType(query.type) : null;
  if (query.type && !type) throw new HttpError(400, `type must be one of: ${TOUR_TYPES.join(', ')}`, { code: 'VALIDATION_ERROR' });
  let isActive = null;
  if (query.status && !['active', 'inactive'].includes(query.status)) {
    throw new HttpError(400, 'status must be active or inactive.', { code: 'VALIDATION_ERROR' });
  }
  if (query.status) isActive = query.status === 'active';
  return {
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 200) : '',
    page, limit, offset: (page - 1) * limit,
    countryId: positiveInteger(query.countryId, null),
    zoneId: positiveInteger(query.zoneId, null),
    nodeId: positiveInteger(query.nodeId, null),
    type, isActive,
    difficulty: typeof query.difficulty === 'string' && query.difficulty.trim()
      ? query.difficulty.trim().slice(0, 80) : null,
  };
}

function assertResource(resource) {
  if (!RESOURCE_SET.has(resource)) throw new HttpError(404, 'Maintenance resource not found.', { code: 'RESOURCE_NOT_FOUND' });
}

function normalizeRecordId(resource, id) {
  if (resource === 'birds-by-node') {
    if (!/^\d+:\d+$/.test(String(id || ''))) {
      throw new HttpError(400, 'id must use nodeId:birdId.', { code: 'VALIDATION_ERROR' });
    }
    return String(id);
  }
  return positiveInteger(id, null);
}

class AdminMaintenanceService {
  async withDerivedTourCoordinates(data, currentId = null) {
    let nodeId = data.nodeId;
    if (!nodeId && currentId) {
      const current = await adminMaintenanceQueries.getById('tours', currentId);
      if (!current) throw new HttpError(404, 'Record not found.', { code: 'RECORD_NOT_FOUND' });
      nodeId = current.nodeId;
    }
    const node = await adminMaintenanceQueries.getById('nodes', Number(nodeId));
    if (!node) throw new HttpError(422, 'Select an existing node before saving the tour.', { code: 'NODE_NOT_FOUND' });
    const hasLatitude = node.lat !== null && node.lat !== '' && Number.isFinite(Number(node.lat));
    const hasLongitude = node.lon !== null && node.lon !== '' && Number.isFinite(Number(node.lon));
    if (!hasLatitude || !hasLongitude) {
      throw new HttpError(422, 'The selected node needs valid map coordinates before this tour can be saved.', {
        code: 'NODE_COORDINATES_REQUIRED',
      });
    }
    return { ...data, nodeId: Number(nodeId), lat: Number(node.lat), lon: Number(node.lon) };
  }

  async list(resource, query, { ownerId = null } = {}) {
    assertResource(resource);
    const filters = normalizeListQuery(resource, query);
    const result = await adminMaintenanceQueries.list(resource, { ...filters, ownerId });
    return {
      data: { items: result.rows, tourTypes: resource === 'tours' ? TOUR_TYPES : undefined },
      meta: {
        page: filters.page, limit: filters.limit, total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / filters.limit),
      },
    };
  }

  async getById(resource, id) {
    assertResource(resource);
    const entity = await adminMaintenanceQueries.getById(resource, normalizeRecordId(resource, id));
    if (!entity) throw new HttpError(404, 'Record not found.', { code: 'RECORD_NOT_FOUND' });
    return { entity };
  }

  async create(resource, data, { authUser } = {}) {
    assertResource(resource);
    try {
      const derived = resource === 'tours' ? await this.withDerivedTourCoordinates(data) : data;
      const record = resource === 'tours'
        ? { ...derived, createdByUserId: Number(authUser?.id) }
        : derived;
      return { entity: await adminMaintenanceQueries.create(resource, record) };
    } catch (error) { throw databaseError(error); }
  }

  async update(resource, id, data) {
    assertResource(resource);
    try {
      const normalizedId = normalizeRecordId(resource, id);
      const record = resource === 'tours'
        ? await this.withDerivedTourCoordinates(data, normalizedId)
        : data;
      const entity = await adminMaintenanceQueries.update(resource, normalizedId, record);
      if (!entity) throw new HttpError(404, 'Record not found.', { code: 'RECORD_NOT_FOUND' });
      return { entity };
    } catch (error) { throw databaseError(error); }
  }

  async remove(resource, id) {
    assertResource(resource);
    try {
      const entity = await adminMaintenanceQueries.remove(resource, normalizeRecordId(resource, id));
      if (!entity) throw new HttpError(404, 'Record not found.', { code: 'RECORD_NOT_FOUND' });
      return { entity, archived: resource !== 'countries' };
    } catch (error) { throw databaseError(error); }
  }
}

export { databaseError, normalizeListQuery };
export default new AdminMaintenanceService();
