import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import HttpError from './httpError.js';

export function signAuthToken(user) {
  return jwt.sign(
    {
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      role: user.role || 'customer',
    },
    env.jwtSecret,
    {
      subject: String(user.id),
      expiresIn: env.jwtExpiresIn,
    }
  );
}

export function getAuthTokenExpiresAt(token) {
  const payload = jwt.decode(token);

  if (!payload?.exp) {
    return null;
  }

  return new Date(payload.exp * 1000).toISOString();
}

export function verifyAuthToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret);

    if (!payload.sub || typeof payload.email !== 'string') {
      throw new Error('Invalid token payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      role: payload.role === 'admin' ? 'admin' : 'customer',
    };
  } catch {
    throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
  }
}
