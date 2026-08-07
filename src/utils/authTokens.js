import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import HttpError from './httpError.js';
import { normalizeUserRole, USER_ROLES } from '../constants/userRoles.js';

export function signAuthToken(user) {
  return jwt.sign(
    {
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      role: normalizeUserRole(user.role) || USER_ROLES.CUSTOMER,
      ...(user.plan ? { plan: user.plan } : {}),
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
      role: normalizeUserRole(payload.role) || USER_ROLES.CUSTOMER,
      plan: typeof payload.plan === 'string' ? payload.plan : undefined,
    };
  } catch {
    throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
  }
}
