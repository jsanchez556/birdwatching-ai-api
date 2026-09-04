import { ALLOWED_TRANSFER_OPTIONS } from '../constants/business.js';

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTextOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function parseDateTime(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return 0;
  }

  const timestamp = Date.parse(normalized.replace(' ', 'T'));

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeComparableText(value) {
  return normalizeText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase() || '';
}

function normalizeSelectedTransfer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const transferOption = normalizeOptionalText(value.transferOption);
  const pricePerPerson = Number(value.pricePerPerson);
  const totalPrice = Number(value.totalPrice);

  if (!ALLOWED_TRANSFER_OPTIONS.includes(transferOption)) {
    return undefined;
  }

  return {
    transferOption,
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
  normalizeNumberOrNull,
  normalizeOptionalText,
  normalizeSelectedTransfer,
  normalizeText,
  normalizeTextOrEmpty,
  parseDateTime,
};
