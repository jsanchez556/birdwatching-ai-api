import crypto from 'crypto';
import bcrypt from 'bcrypt';
import userQueries from '../db/queries/user.queries.js';
import refreshTokenQueries from '../db/queries/refreshToken.queries.js';
import env from '../config/env.js';
import HttpError from '../utils/httpError.js';
import { getAuthTokenExpiresAt, signAuthToken } from '../utils/authTokens.js';

const DUPLICATE_KEY_ERROR = '23505';
const REFRESH_TOKEN_BYTES = 32;
const SALT_ROUNDS = 12;

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || 'customer',
  };
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function generateRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

function refreshTokenExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.refreshTokenExpiresInDays);
  return expiresAt;
}

class AuthService {
  async issueSession(user) {
    const token = signAuthToken(user);
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = refreshTokenExpiresAt();

    await refreshTokenQueries.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });

    return {
      token,
      accessTokenExpiresAt: getAuthTokenExpiresAt(token),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      user: safeUser(user),
    };
  }

  async signup({ email, password, name }) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const user = await userQueries.create({
        email: normalizedEmail,
        name: name?.trim() || null,
        passwordHash,
      });

      return this.issueSession(user);
    } catch (error) {
      if (error.code === DUPLICATE_KEY_ERROR) {
        throw new HttpError(409, 'An account with this email already exists', {
          code: 'EMAIL_ALREADY_EXISTS',
        });
      }

      throw error;
    }
  }

  async login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userQueries.findByEmail(normalizedEmail);
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new HttpError(401, 'Invalid email or password', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    return this.issueSession(user);
  }

  async refresh({ refreshToken }) {
    const tokenRecord = await refreshTokenQueries.findActiveByHash(hashRefreshToken(refreshToken));

    if (!tokenRecord) {
      throw new HttpError(401, 'Session expired. Please log in again.', {
        code: 'SESSION_EXPIRED',
      });
    }

    const user = await userQueries.findById(tokenRecord.userId);

    if (!user) {
      await refreshTokenQueries.revokeByHash(tokenRecord.tokenHash);
      throw new HttpError(401, 'Session expired. Please log in again.', {
        code: 'SESSION_EXPIRED',
      });
    }

    await refreshTokenQueries.revokeByHash(tokenRecord.tokenHash);
    return this.issueSession(user);
  }

  async logout({ refreshToken }) {
    if (refreshToken) {
      await refreshTokenQueries.revokeByHash(hashRefreshToken(refreshToken));
    }

    return { revoked: true };
  }
}

export default new AuthService();
