export const TOUR_DURATION_UNITS = Object.freeze(['hours', 'days']);

export function normalizeDurationUnit(value) {
  return TOUR_DURATION_UNITS.includes(value) ? value : null;
}

export function durationToHours(value, unit) {
  const numericValue = Number(value);
  const normalizedUnit = normalizeDurationUnit(unit);

  if (!Number.isInteger(numericValue) || numericValue <= 0 || !normalizedUnit) return null;
  return normalizedUnit === 'days' ? numericValue * 24 : numericValue;
}

export function formatTourDuration(value, unit) {
  const numericValue = Number(value);
  const normalizedUnit = normalizeDurationUnit(unit);

  if (!Number.isFinite(numericValue) || numericValue <= 0 || !normalizedUnit) return null;
  const singular = normalizedUnit === 'days' ? 'day' : 'hour';
  return `${numericValue} ${numericValue === 1 ? singular : normalizedUnit}`;
}

export function normalizeTourDuration(source = {}) {
  const durationUnit = normalizeDurationUnit(source.durationUnit ?? source.duration_unit) || 'hours';
  const rawValue = source.durationValue ?? source.duration_value ?? source.durationHours ?? source.duration_hours;
  const durationValue = Number(rawValue);
  const durationHours = durationToHours(durationValue, durationUnit);

  return {
    durationValue,
    durationUnit,
    durationHours,
    duration: formatTourDuration(durationValue, durationUnit),
  };
}
