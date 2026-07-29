import HttpError from '../../utils/httpError.js';
import { verifyAuthToken } from '../../utils/authTokens.js';
import env from '../../config/env.js';
import userAccessQueries from '../../db/queries/userAccess.queries.js';

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

function createAuthMiddleware({
  required,
  accessRepository = env.nodeEnv && env.nodeEnv !== 'test' ? userAccessQueries : null,
} = {}) {
  return async function authenticate(req, res, next) {
    const token = getBearerToken(req);

    if (!token) {
      return required
        ? next(new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' }))
        : next();
    }

    try {
      req.user = verifyAuthToken(token);
      if (accessRepository) {
        const access = await accessRepository.getAccessState({ userId: req.user.id });
        if (!access) {
          return next(new HttpError(401, 'Authentication is required', {
            code: 'UNAUTHORIZED',
          }));
        }
        if (access.suspended_at) {
          return next(new HttpError(403, 'This account is suspended', {
            code: 'ACCOUNT_SUSPENDED',
          }));
        }
        req.user.role = access.role === 'admin' ? 'admin' : 'customer';
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const optionalAuth = createAuthMiddleware({ required: false });
export const requireAuth = createAuthMiddleware({ required: true });

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' }));
  }

  if (req.user.role !== 'admin') {
    return next(new HttpError(403, 'Admin access is required', { code: 'FORBIDDEN' }));
  }

  return next();
}

export { createAuthMiddleware };
