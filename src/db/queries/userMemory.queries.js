import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapMemory(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    category: row.category,
    content: row.content,
    confidence: Number(row.confidence),
    sourceMessageId: row.source_message_id === null ? null : Number(row.source_message_id),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isUserEditable: row.is_user_editable === true,
    isActive: row.is_active !== false,
    conflictKey: row.conflict_key || null,
    resolution: row.resolution || 'none',
    supersededById: row.superseded_by_id === null || row.superseded_by_id === undefined
      ? null
      : Number(row.superseded_by_id),
    supersededAt: row.superseded_at || null,
  };
}

export class UserMemoryQueries {
  async getActive(userId, limit = 50) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_active_user_memories($1, $2)',
        [userId, limit]
      );
      return result.rows.map(mapMemory);
    } catch (error) {
      logger.error('Failed to retrieve active user memories', { code: error.code });
      throw error;
    }
  }

  async save({
    userId,
    category,
    content,
    contentFingerprint,
    confidence,
    sourceMessageId,
    expiresAt,
    isUserEditable,
    conflictKey,
    resolution,
    supersedesMemoryIds,
  }) {
    try {
      const result = await pool.query(
        'SELECT * FROM save_user_memory_v2($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          userId,
          category,
          content,
          contentFingerprint,
          confidence,
          sourceMessageId,
          expiresAt,
          isUserEditable,
          conflictKey,
          resolution,
          supersedesMemoryIds,
        ]
      );
      return mapMemory(result.rows[0]);
    } catch (error) {
      logger.error('Failed to save user memory', { code: error.code });
      throw error;
    }
  }

  async getHistory(userId, limit = 100) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_user_memory_history($1, $2)',
        [userId, limit]
      );
      return result.rows.map(mapMemory);
    } catch (error) {
      logger.error('Failed to retrieve user memory history', { code: error.code });
      throw error;
    }
  }
}

export { mapMemory };
export default new UserMemoryQueries();
