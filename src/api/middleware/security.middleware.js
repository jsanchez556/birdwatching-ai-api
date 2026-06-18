import helmet from 'helmet';
import env from '../../config/env.js';
import HttpError from '../../utils/httpError.js';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const securityHeaders = helmet({
  contentSecurityPolicy: false,
});

function hasAllowedOrigins() {
  return env.corsOrigins.length > 0;
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  return hasAllowedOrigins() && env.corsOrigins.includes(origin);
}

function getAllowedOrigin(origin) {
  if (!origin) {
    return null;
  }

  return hasAllowedOrigins() && env.corsOrigins.includes(origin) ? origin : null;
}

export function corsProtection(req, res, next) {
  const origin = req.get('origin');
  const allowedOrigin = getAllowedOrigin(origin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', env.corsAllowedHeaders.join(', '));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }

  if (!isOriginAllowed(origin)) {
    return next(new HttpError(403, 'Origin is not allowed', { code: 'CORS_ORIGIN_DENIED' }));
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

export function sanitizeRequestValue(value) {
  if (typeof value === 'string') {
    return value.replace(/\0/g, '');
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRequestValue(item));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DANGEROUS_KEYS.has(key))
      .map(([key, entryValue]) => [key, sanitizeRequestValue(entryValue)])
  );
}

export function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeRequestValue(req.body);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeRequestValue(req.params);
  }

  return next();
}
