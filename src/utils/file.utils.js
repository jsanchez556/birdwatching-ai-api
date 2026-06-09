import path from 'path';
import { normalizeText } from './normalizer.utils.js';

function normalizeMediaPath(mediaUrl) {
  const value = normalizeText(mediaUrl);

  if (!value) {
    return null;
  }

  try {
    return new URL(value).pathname || value;
  } catch {
    return value;
  }
}

function normalizeExportedMediaPath(key) {
  const value = String(key || '').trim().replace(/^\/+/, '');

  return value ? `/${value}` : null;
}

function resolveMediaUrl(mediaUrl, baseUrl) {
  const value = normalizeText(mediaUrl);

  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    if (!baseUrl) {
      return null;
    }

    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
  }
}

function baseNameFromUrl(mediaUrl, baseUrl) {
  const value = normalizeText(mediaUrl);

  if (!value) {
    return null;
  }

  try {
    const basename = path.basename(new URL(value, baseUrl).pathname);

    return basename || null;
  } catch {
    const basename = path.basename(value);

    return basename || null;
  }
}

export {
  baseNameFromUrl,
  normalizeExportedMediaPath,
  normalizeMediaPath,
  resolveMediaUrl,
};
