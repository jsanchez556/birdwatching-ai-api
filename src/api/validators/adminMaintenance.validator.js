import { TOUR_TYPES, normalizeTourType } from '../../constants/tourTypes.js';
import { durationToHours, TOUR_DURATION_UNITS } from '../../utils/tourDuration.utils.js';

export const ADMIN_MAINTENANCE_RESOURCES = Object.freeze([
  'birds', 'birds-by-node', 'nodes', 'zones', 'countries', 'tours',
]);

const RESOURCE_SET = new Set(ADMIN_MAINTENANCE_RESOURCES);
const FIELDS = Object.freeze({
  countries: ['name', 'acr', 'latitude', 'longitude', 'zoom'],
  zones: ['countryId', 'name', 'description', 'rank', 'isActive'],
  nodes: ['parentId', 'zoneId', 'name', 'rank', 'lat', 'lon', 'description', 'isActive'],
  birds: ['speciesCode', 'name', 'tags', 'isActive'],
  'birds-by-node': ['nodeId', 'birdId', 'rank', 'isActive'],
  tours: ['nodeId', 'name', 'description', 'type', 'price', 'availableSlots',
    'durationHours', 'durationValue', 'durationUnit', 'difficulty', 'startDate', 'endDate', 'sourceUrl',
    'tourType', 'isActive', 'maxParticipants', 'minimumPrice'],
});
const REQUIRED = Object.freeze({
  countries: ['name', 'acr'],
  zones: ['countryId', 'name', 'description', 'rank'],
  nodes: ['zoneId', 'name', 'rank', 'lat', 'lon'],
  birds: ['name'],
  'birds-by-node': ['nodeId', 'birdId', 'rank'],
  tours: ['nodeId', 'name', 'type', 'price', 'difficulty'],
});

function isPositiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validateId(value, field, errors, { nullable = false } = {}) {
  if (nullable && (value === null || value === '')) return;
  if (!isPositiveInteger(value)) errors.push(`${field} must be a positive integer`);
}

function validateNumber(value, field, errors, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === null || value === '') return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    errors.push(`${field} must be ${integer ? 'an integer' : 'a number'} from ${min} through ${max}`);
  }
}

function validateString(value, field, errors, { required = false, max = 5000 } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) errors.push(`${field} is required`);
    return;
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    errors.push(`${field} must be a non-empty string no longer than ${max} characters`);
  }
}

function validateResource(resource, errors) {
  if (!RESOURCE_SET.has(resource)) errors.push('resource is not a supported maintenance resource');
}

function validateBody(resource, body, operation, errors) {
  const allowed = new Set(FIELDS[resource] || []);
  for (const key of Object.keys(body || {})) {
    if (!allowed.has(key)) errors.push(`${key} is not allowed for ${resource}`);
  }
  if (operation === 'create') {
    for (const field of REQUIRED[resource] || []) {
      if (body?.[field] === undefined || body?.[field] === null || body?.[field] === '') {
        errors.push(`${field} is required`);
      }
    }
  } else if (Object.keys(body || {}).length === 0) {
    errors.push('At least one field is required');
  }

  if (resource === 'tours') {
    const tourType = body?.tourType || 'unscheduled';
    const hasCanonicalDuration = body?.durationValue !== undefined || body?.durationUnit !== undefined;
    const durationValue = hasCanonicalDuration ? body?.durationValue : body?.durationHours;
    const durationUnit = hasCanonicalDuration ? body?.durationUnit : 'hours';

    if (operation === 'create' && (durationValue === undefined || durationValue === null || durationValue === '')) {
      errors.push('durationValue is required');
    } else if (durationValue !== undefined && durationToHours(durationValue, durationUnit) === null) {
      errors.push(`durationValue must be a positive integer and durationUnit must be one of: ${TOUR_DURATION_UNITS.join(', ')}`);
    }

    if (tourType === 'unscheduled' && operation === 'create' && (body?.maxParticipants === undefined
      || body?.maxParticipants === null || body?.maxParticipants === '')) {
      errors.push('maxParticipants is required');
    }

    if (hasCanonicalDuration && !TOUR_DURATION_UNITS.includes(body?.durationUnit)) {
      errors.push(`durationUnit must be one of: ${TOUR_DURATION_UNITS.join(', ')}`);
    }

    if (tourType === 'scheduled') {
      for (const field of ['availableSlots', 'startDate', 'endDate']) {
        if ((operation === 'create' || body?.tourType === 'scheduled')
          && (body?.[field] === undefined || body?.[field] === null || body?.[field] === '')) {
          errors.push(`${field} is required for scheduled tours`);
        }
      }
    }
  }

  for (const field of ['name', 'description', 'difficulty']) {
    if (field in (body || {})) validateString(body[field], field, errors, { required: field === 'name' });
  }
  if ('acr' in (body || {})) {
    validateString(body.acr, 'acr', errors, { required: true, max: 8 });
    if (typeof body.acr === 'string' && !/^[A-Za-z]{2,8}$/.test(body.acr.trim())) errors.push('acr must contain 2 to 8 letters');
  }
  if ('speciesCode' in (body || {}) && body.speciesCode !== null && body.speciesCode !== '') {
    validateString(body.speciesCode, 'speciesCode', errors, { max: 80 });
  }
  for (const field of ['countryId', 'zoneId', 'nodeId', 'birdId']) {
    if (field in (body || {})) validateId(body[field], field, errors);
  }
  if ('parentId' in (body || {})) validateId(body.parentId, 'parentId', errors, { nullable: true });
  if ('rank' in (body || {})) validateNumber(body.rank, 'rank', errors, { min: 0, max: 100000, integer: true });
  if ('lat' in (body || {})) validateNumber(body.lat, 'lat', errors, { min: -90, max: 90 });
  if ('lon' in (body || {})) validateNumber(body.lon, 'lon', errors, { min: -180, max: 180 });
  if ('latitude' in (body || {})) validateNumber(body.latitude, 'latitude', errors, { min: -90, max: 90 });
  if ('longitude' in (body || {})) validateNumber(body.longitude, 'longitude', errors, { min: -180, max: 180 });
  if ('zoom' in (body || {})) validateNumber(body.zoom, 'zoom', errors, { min: 0, max: 19, integer: true });
  for (const field of ['price', 'minimumPrice']) {
    if (field in (body || {})) validateNumber(body[field], field, errors, { min: 0, max: 1000000 });
  }
  for (const field of ['availableSlots']) {
    if (field in (body || {})) validateNumber(body[field], field, errors, { min: 0, max: 100000, integer: true });
  }
  for (const field of ['durationHours', 'durationValue', 'maxParticipants']) {
    if (field in (body || {})) validateNumber(body[field], field, errors, { min: 1, max: 100000, integer: true });
  }
  if ('type' in (body || {})) {
    const type = normalizeTourType(body.type);
    if (!type) errors.push(`type must be one of: ${TOUR_TYPES.join(', ')}`);
    else body.type = type;
  }
  if ('tourType' in (body || {}) && !['scheduled', 'unscheduled'].includes(body.tourType)) {
    errors.push('tourType must be scheduled or unscheduled');
  }
  if ('isActive' in (body || {}) && typeof body.isActive !== 'boolean') errors.push('isActive must be a boolean');
  if ('tags' in (body || {}) && (!Array.isArray(body.tags)
    || body.tags.some((tag) => typeof tag !== 'string' || !tag.trim()))) {
    errors.push('tags must be an array of non-empty strings');
  }
  for (const field of ['startDate', 'endDate']) {
    if (field in (body || {}) && body[field] !== null && body[field] !== ''
      && !/^\d{4}-\d{2}-\d{2}$/.test(body[field])) errors.push(`${field} must use YYYY-MM-DD`);
  }
  if (body?.startDate && body?.endDate && body.startDate > body.endDate) errors.push('startDate must not be after endDate');
  if ('sourceUrl' in (body || {}) && body.sourceUrl !== null && body.sourceUrl !== '') {
    try {
      const url = new URL(body.sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      errors.push('sourceUrl must be an HTTP or HTTPS URL');
    }
  }
}

export function validateAdminMaintenance(operation) {
  return function validator(req) {
    const errors = [];
    const resource = req.params?.resource;
    validateResource(resource, errors);
    let id = req.params?.id;
    if (operation !== 'create') {
      if (resource === 'birds-by-node') {
        if (!/^\d+:\d+$/.test(String(id || ''))) errors.push('id must use nodeId:birdId');
      } else if (!isPositiveInteger(id)) errors.push('id must be a positive integer');
      else id = Number(id);
    }
    if (operation === 'create' || operation === 'update') validateBody(resource, req.body || {}, operation, errors);
    else if (Object.keys(req.body || {}).length > 0) errors.push('Delete payload does not accept fields');
    return {
      message: `Invalid admin ${resource || 'maintenance'} request`,
      errors,
      value: { resource, ...(id !== undefined ? { id } : {}) },
    };
  };
}

export function validateMyTour(operation) {
  const validator = validateAdminMaintenance(operation);
  return function myTourValidator(req) {
    const result = validator({
      ...req,
      params: { ...(req.params || {}), resource: 'tours' },
    });
    return { ...result, value: {} };
  };
}

export function validateAdminTourImage(req) {
  const errors = [];

  if (!isPositiveInteger(req.params?.tourId)) {
    errors.push('tourId must be a positive integer');
  }

  return {
    message: 'Invalid admin tour image request',
    errors,
    value: {},
  };
}

export { FIELDS, REQUIRED };
