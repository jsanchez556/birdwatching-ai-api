import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapReference(row) {
  if (!row) return null;
  return {
    referenceId: row.reference_id,
    toolName: row.tool_name,
    ...(row.result === undefined ? {} : { result: row.result }),
    total: row.total_count === null || row.total_count === undefined
      ? null
      : Number(row.total_count),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export class ToolResultReferenceQueries {
  async save({ referenceId, conversationId, userId, toolName, result, total, expiresAt }) {
    try {
      const queryResult = await pool.query(
        'SELECT * FROM save_tool_result_reference($1, $2, $3, $4, $5, $6, $7)',
        [
          referenceId,
          conversationId,
          userId ?? null,
          toolName,
          JSON.stringify(result),
          total ?? null,
          expiresAt,
        ]
      );
      return mapReference(queryResult.rows[0]);
    } catch (error) {
      logger.error('Failed to store tool result reference', { code: error.code });
      throw error;
    }
  }

  async get({ referenceId, conversationId, userId }) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_tool_result_reference($1, $2, $3)',
        [referenceId, conversationId, userId ?? null]
      );
      return mapReference(result.rows[0]);
    } catch (error) {
      logger.error('Failed to retrieve tool result reference', { code: error.code });
      throw error;
    }
  }
}

export { mapReference };
export default new ToolResultReferenceQueries();

