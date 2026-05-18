import HttpError from '../utils/httpError.js';
import { verifyAuthToken } from '../utils/authTokens.js';

function getBearerToken(req) {
  const header = req.get('authorization');

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export function optionalAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return next();
  }

  try {
    req.user = verifyAuthToken(token);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return next(new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' }));
  }

  try {
    req.user = verifyAuthToken(token);
    return next();
  } catch (error) {
    return next(error);
  }
}
