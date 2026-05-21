import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapRefreshToken(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

class RefreshTokenQueries {
  async create({ userId, tokenHash, expiresAt }) {
    try {
      const query = `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, token_hash, expires_at, revoked_at, created_at
      `;
      const result = await pool.query(query, [userId, tokenHash, expiresAt]);
      return mapRefreshToken(result.rows[0]);
    } catch (error) {
      logger.warn('Failed to create refresh token', {
        code: error.code,
      });
      throw error;
    }
  }

  async findActiveByHash(tokenHash) {
    const query = `
      SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
      FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `;
    const result = await pool.query(query, [tokenHash]);
    return mapRefreshToken(result.rows[0]);
  }

  async revokeByHash(tokenHash) {
    const query = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `;
    await pool.query(query, [tokenHash]);
  }
}

export default new RefreshTokenQueries();
