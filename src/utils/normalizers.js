import { ALLOWED_TRANSPORTATION_OPTIONS } from '../constants/business.js';

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTextOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeComparableText(value) {
  return normalizeText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase() || '';
}

function normalizeSelectedTransportation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const transportationOption = normalizeOptionalText(value.transportationOption);
  const pricePerPerson = Number(value.pricePerPerson);
  const totalPrice = Number(value.totalPrice);

  if (!ALLOWED_TRANSPORTATION_OPTIONS.includes(transportationOption)) {
    return undefined;
  }

  return {
    transportationOption,
    ...(normalizeOptionalText(value.origin) ? { origin: normalizeOptionalText(value.origin) } : {}),
    ...(normalizeOptionalText(value.destination) ? { destination: normalizeOptionalText(value.destination) } : {}),
    ...(normalizeOptionalText(value.label) ? { label: normalizeOptionalText(value.label) } : {}),
    ...(Number.isFinite(pricePerPerson) ? { pricePerPerson } : {}),
    ...(Number.isFinite(totalPrice) ? { totalPrice } : {}),
    ...(normalizeOptionalText(value.currency) ? { currency: normalizeOptionalText(value.currency) } : {}),
    ...(normalizeOptionalText(value.estimatedTravelTime)
      ? { estimatedTravelTime: normalizeOptionalText(value.estimatedTravelTime) }
      : {}),
  };
}

export {
  normalizeComparableText,
  normalizeOptionalText,
  normalizeSelectedTransportation,
  normalizeText,
  normalizeTextOrEmpty,
};
