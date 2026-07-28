import crypto from 'crypto';
import bcrypt from 'bcrypt';
import userQueries from '../db/queries/user.queries.js';
import refreshTokenQueries from '../db/queries/refreshToken.queries.js';
import planService, { DEFAULT_PLAN_NAME } from './plan.service.js';
import S3BucketService from '../storage/s3Bucket.service.js';
import env from '../config/env.js';
import HttpError from '../utils/httpError.js';
import { getAuthTokenExpiresAt, signAuthToken } from '../utils/authTokens.js';
import analytics from '../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../analytics/events.js';

const DUPLICATE_KEY_ERROR = '23505';
const REFRESH_TOKEN_BYTES = 32;
const SALT_ROUNDS = 12;
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function profileImageUrl(profileImageKey) {
  if (!profileImageKey) {
    return null;
  }

  return `/files/${profileImageKey.replace(/^\/+/, '')}`;
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || 'customer',
    plan: user.plan || DEFAULT_PLAN_NAME,
    imageUrl: profileImageUrl(user.profileImageKey),
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
  constructor(options = {}) {
    this.bucketService = options.bucketService;
  }

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
      const subscription = await planService.ensureDefaultSubscription(user.id);

      const session = await this.issueSession({
        ...user,
        plan: subscription.plan,
      });
      analytics.track({
        userId: user.id,
        event: ANALYTICS_EVENTS.USER_SIGNED_UP,
        properties: {
          role: user.role || 'customer',
          plan: subscription.plan,
          source: 'email_password',
        },
      });
      return session;
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

    const subscription = await planService.ensureDefaultSubscription(user.id);

    const session = await this.issueSession({
      ...user,
      plan: subscription.plan,
    });
    return session;
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
    const subscription = await planService.ensureDefaultSubscription(user.id);

    return this.issueSession({
      ...user,
      plan: subscription.plan,
    });
  }

  async logout({ refreshToken }) {
    if (refreshToken) {
      await refreshTokenQueries.revokeByHash(hashRefreshToken(refreshToken));
    }

    return { revoked: true };
  }

  async updateProfile({ authUser, name }) {
    if (!authUser?.id) {
      throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
    }

    const user = await userQueries.updateProfile({
      userId: authUser.id,
      name,
    });

    if (!user) {
      throw new HttpError(404, 'User not found', { code: 'USER_NOT_FOUND' });
    }

    return {
      user: safeUser(user),
    };
  }

  async updateProfileImage({ authUser, imageUpload }) {
    if (!authUser?.id) {
      throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
    }

    if (!imageUpload?.buffer || !Buffer.isBuffer(imageUpload.buffer)) {
      throw new HttpError(422, 'Profile image is required', { code: 'PROFILE_IMAGE_REQUIRED' });
    }

    if (imageUpload.buffer.length > PROFILE_IMAGE_MAX_BYTES) {
      throw new HttpError(413, 'Profile image is too large', { code: 'PROFILE_IMAGE_TOO_LARGE' });
    }

    const extension = PROFILE_IMAGE_CONTENT_TYPES.get(imageUpload.mimeType);

    if (!extension) {
      throw new HttpError(422, 'Profile image must be a JPEG, PNG, or WebP file', {
        code: 'INVALID_PROFILE_IMAGE_TYPE',
      });
    }

    const key = `user-profile-images/user-${authUser.id}-${crypto.randomUUID()}.${extension}`;
    const bucketService = this.bucketService || new S3BucketService();

    try {
      await bucketService.uploadObject({
        key,
        body: imageUpload.buffer,
        contentType: imageUpload.mimeType,
        metadata: {
          entityType: 'user-profile-image',
          userId: String(authUser.id),
        },
        skipIfExists: false,
      });
    } catch {
      throw new HttpError(502, 'Profile image could not be saved. Please try again.', {
        code: 'PROFILE_IMAGE_UPLOAD_FAILED',
        expose: true,
      });
    }

    const user = await userQueries.updateProfileImage({
      userId: authUser.id,
      profileImageKey: key,
    });

    if (!user) {
      throw new HttpError(404, 'User not found', { code: 'USER_NOT_FOUND' });
    }

    return {
      user: safeUser(user),
    };
  }
}

export {
  AuthService,
  PROFILE_IMAGE_CONTENT_TYPES,
  PROFILE_IMAGE_MAX_BYTES,
  profileImageUrl,
  safeUser,
};
export default new AuthService();
