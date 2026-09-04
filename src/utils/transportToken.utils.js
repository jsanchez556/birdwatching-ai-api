import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import HttpError from './httpError.js';

export function signTransportToken(payload, purpose, ttlSeconds) {
  return jwt.sign({ ...payload, purpose }, env.transport.tokenSecret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

export function verifyTransportToken(token, purpose) {
  try {
    const payload = jwt.verify(token, env.transport.tokenSecret, { algorithms: ['HS256'] });
    if (payload.purpose !== purpose) throw new Error('wrong purpose');
    return payload;
  } catch {
    throw new HttpError(422, `The ${purpose} is invalid or expired.`, {
      code: purpose === 'route' ? 'ROUTE_TOKEN_INVALID' : 'QUOTE_TOKEN_INVALID',
    });
  }
}
