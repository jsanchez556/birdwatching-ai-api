export const TOUR_TYPES = Object.freeze([
  'Birdwatching',
  'Day walk',
  'Night walk',
  'Day & Night Walk',
  'Adventure',
  'Excursion',
  'Transfer',
  'Other',
]);

export const DEFAULT_TOUR_TYPE = TOUR_TYPES[0];

export function normalizeTourType(value, { allowEmpty = false } = {}) {
  if ((value === undefined || value === null || value === '') && allowEmpty) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = TOUR_TYPES.find((type) => type.toLowerCase() === value.trim().toLowerCase());
  return normalized;
}

export function isTourType(value) {
  return normalizeTourType(value) !== undefined;
}
