import { randomUUID } from 'node:crypto';

const TOUR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const TOUR_IMAGE_MIME_TYPE = 'image/png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UUID_IMAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
const TOUR_ID_IMAGE_NAME_PATTERN = /^[1-9]\d*(?:\.png)?$/;
const TOUR_IMAGE_KEY_PATTERN = /^tours\/([a-z0-9-]+(?:\.png)?)$/;

function hasPngSignature(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= PNG_SIGNATURE.length
    && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function normalizeTourId(value) {
  const normalized = String(value ?? '').trim();
  const id = Number(normalized);
  return /^\d+$/.test(normalized) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function buildTourImageKey(tourId) {
  const id = normalizeTourId(tourId);
  if (!id) throw new Error('Invalid tour ID');
  return `tours/${id}.png`;
}

function buildTourImageUploadKey() {
  return `tours/${randomUUID()}.png`;
}

function isTourImageKey(value) {
  const key = String(value || '').trim();
  const match = key.match(TOUR_IMAGE_KEY_PATTERN);
  return Boolean(match && (
    TOUR_ID_IMAGE_NAME_PATTERN.test(match[1]) || UUID_IMAGE_NAME_PATTERN.test(match[1])
  ));
}

function normalizeTourImageKey(value) {
  const key = String(value || '').trim();
  if (!isTourImageKey(key)) return null;
  return /^tours\/[1-9]\d*$/.test(key) ? `${key}.png` : key;
}

function resolveTourImageKey({ tourId, imagePath } = {}) {
  const storedPath = String(imagePath || '').trim();
  if (storedPath) return normalizeTourImageKey(storedPath);
  try {
    return buildTourImageKey(tourId);
  } catch {
    return null;
  }
}

function tourImageVersionFromDate(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? String(timestamp) : '';
}

function appendTourImageVersion(reference, version) {
  if (!reference || !version) return reference || '';
  const separator = reference.includes('?') ? '&' : '?';
  return `${reference}${separator}v=${encodeURIComponent(version)}`;
}

export {
  appendTourImageVersion,
  buildTourImageKey,
  buildTourImageUploadKey,
  hasPngSignature,
  isTourImageKey,
  normalizeTourImageKey,
  normalizeTourId,
  resolveTourImageKey,
  tourImageVersionFromDate,
  TOUR_IMAGE_KEY_PATTERN,
  TOUR_IMAGE_MAX_BYTES,
  TOUR_IMAGE_MIME_TYPE,
};
