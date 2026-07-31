import pool from '../pool.js';
import logger from '../../utils/logger.js';

export class ConversationQueries {
  /**
   * Save a chat message to the database
   * @param {string} conversationId - Conversation identifier
   * @param {string} userInput - The user's input
   * @param {string} aiOutput - The AI's output
   * @returns {Promise<object>} The saved message
   */
  async saveMessage(conversationId, userInput, aiOutput, userId, metadata = undefined) {
    try {
      const hasUserId = userId !== undefined && userId !== null;
      const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;
      const query = hasMetadata
        ? `SELECT * FROM save_message($1, $2, $3, $4, $5)`
        : hasUserId
        ? `SELECT * FROM save_message($1, $2, $3, $4)`
        : `SELECT * FROM save_message($1, $2, $3)`;
      const values = hasMetadata
        ? [conversationId, userInput, aiOutput, hasUserId ? userId : null, JSON.stringify(metadata)]
        : hasUserId
        ? [conversationId, userInput, aiOutput, userId]
        : [conversationId, userInput, aiOutput];
      const result = await pool.query(query, values);

      logger.info('Chat message saved', {
        id: result.rows[0].id,
        conversationId,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save chat message', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the most recent chat exchanges for context
   * @param {string} conversationId - Conversation identifier
   * @param {number} limit - Maximum number of exchanges to return
   * @returns {Promise<array>} Array of message records
   */
  async getLastMessages(conversationId, limit = 10, userId) {
    try {
      const hasUserId = userId !== undefined && userId !== null;
      const query = hasUserId
        ? `SELECT * FROM get_last_messages($1, $2, $3)`
        : `SELECT * FROM get_last_messages($1, $2)`;
      const result = await pool.query(query, hasUserId ? [conversationId, limit, userId] : [conversationId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve recent chat messages', {
        error: error.message,
        conversationId,
        limit,
      });
      throw error;
    }
  }

  async getLatestSummary(conversationId, userId) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_latest_conversation_summary($1, $2)',
        [conversationId, userId ?? null]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to retrieve conversation summary', {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  }

  async getMessagesForCompaction(conversationId, limit = 200, userId) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_conversation_messages_for_compaction($1, $2, $3)',
        [conversationId, limit, userId ?? null]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve conversation compaction candidates', {
        error: error.message,
        conversationId,
        limit,
      });
      throw error;
    }
  }

  async saveSummary({
    conversationId,
    userId,
    expectedPreviousVersion,
    schemaVersion,
    summary,
    compactedMessageIds,
    sourceTokenCount,
  }) {
    try {
      const result = await pool.query(
        'SELECT * FROM save_conversation_summary($1, $2, $3, $4, $5, $6, $7)',
        [
          conversationId,
          userId ?? null,
          expectedPreviousVersion ?? null,
          schemaVersion,
          JSON.stringify(summary),
          compactedMessageIds,
          sourceTokenCount,
        ]
      );
      logger.info('Conversation summary saved', {
        conversationId,
        version: result.rows[0]?.version,
        compactedMessageCount: compactedMessageIds.length,
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save conversation summary', {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Get persisted chat exchanges for one conversation
   * @param {string} conversationId - Conversation identifier
   * @param {number} limit - Maximum number of exchanges to return
   * @returns {Promise<array>} Array of message records
   */
  async getByConversationId(conversationId, limit = 100, userId) {
    try {
      const hasUserId = userId !== undefined && userId !== null;
      const query = hasUserId
        ? `SELECT * FROM get_conversation_messages($1, $2, $3)`
        : `SELECT * FROM get_conversation_messages($1, $2)`;
      const result = await pool.query(query, hasUserId ? [conversationId, limit, userId] : [conversationId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve conversation messages', {
        error: error.message,
        conversationId,
        limit,
      });
      throw error;
    }
  }

  async getLatestByUserId(userId) {
    try {
      const query = `
        SELECT conversation_code AS conversation_id
        FROM conversations
        WHERE user_id = $1
          AND COALESCE(metadata->>'conversationType', 'regular') <> 'reservation_entry'
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `;
      const result = await pool.query(query, [userId]);
      return result.rows[0]?.conversation_id || null;
    } catch (error) {
      logger.error('Failed to retrieve latest user conversation', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  async getOwner(conversationId) {
    try {
      const query = `
        SELECT user_id
        FROM conversations
        WHERE conversation_code = $1
        LIMIT 1
      `;
      const result = await pool.query(query, [conversationId]);
      return result.rows[0]?.user_id ?? null;
    } catch (error) {
      logger.error('Failed to retrieve conversation owner', {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  }

  async getMetadata(conversationId, userId) {
    try {
      const hasUserId = userId !== undefined && userId !== null;
      const query = `
        SELECT COALESCE(metadata, '{}'::jsonb) AS metadata
        FROM conversations
        WHERE conversation_code = $1
          AND ($2::INTEGER IS NULL OR user_id = $2::INTEGER)
        LIMIT 1
      `;
      const result = await pool.query(query, [conversationId, hasUserId ? userId : null]);
      return result.rows[0]?.metadata || {};
    } catch (error) {
      logger.error('Failed to retrieve conversation metadata', {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Get all messages with pagination
   * @param {number} offset - Number of records to skip
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<array>} Array of messages
   */
  async getAll(offset = 0, limit = 100) {
    try {
      const query = `SELECT * FROM get_all_messages($1, $2)`;
      const result = await pool.query(query, [offset, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve messages', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get message by ID
   * @param {number} id - The message ID
   * @returns {Promise<object>} The message
   */
  async getById(id) {
    try {
      const query = `
        SELECT m.id, c.conversation_code AS conversation_id, m.user_input, m.ai_output, m.created_at
        FROM messages AS m
        INNER JOIN conversations AS c ON c.id = m.conversation_id
        WHERE m.id = $1
      `;
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to retrieve message', {
        error: error.message,
        id,
      });
      throw error;
    }
  }

  /**
   * Delete message by ID
   * @param {number} id - The message ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(id) {
    try {
      const query = `SELECT delete_message_by_id($1) AS deleted`;
      const result = await pool.query(query, [id]);
      const deleted = result.rows[0]?.deleted ?? false;

      if (deleted) {
        logger.info('Chat message deleted', { id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete message', {
        error: error.message,
        id,
      });
      throw error;
    }
  }
}

export default new ConversationQueries();
