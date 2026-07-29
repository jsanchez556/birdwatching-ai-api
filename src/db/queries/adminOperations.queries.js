import pool from '../pool.js';

class AdminOperationsQueries {
  async createAuditLog({
    adminUserId,
    action,
    targetType,
    targetId,
    metadata,
  }) {
    const result = await pool.query(
      'SELECT * FROM create_admin_audit_log($1, $2, $3, $4, $5::jsonb)',
      [adminUserId, action, targetType, targetId, JSON.stringify(metadata || {})]
    );
    return result.rows[0] || null;
  }

  async finalizeAuditLog({ auditId, adminUserId, metadata }) {
    const result = await pool.query(
      'SELECT * FROM finalize_admin_audit_log($1, $2, $3::jsonb)',
      [auditId, adminUserId, JSON.stringify(metadata || {})]
    );
    return result.rows[0] || null;
  }

  async getJobForAdmin({ jobId }) {
    const result = await pool.query(`
      SELECT job_id, job_type, status
      FROM jobs
      WHERE job_id = $1
      LIMIT 1
    `, [jobId]);
    return result.rows[0] || null;
  }

  async suspendUser({ auditId, adminUserId, userId, reasonCode }) {
    const result = await pool.query(
      'SELECT * FROM suspend_user_by_admin($1, $2, $3, $4)',
      [auditId, adminUserId, userId, reasonCode]
    );
    return result.rows[0] || null;
  }

  async disableAiFeature({
    auditId,
    adminUserId,
    feature,
    disabledUntil,
  }) {
    const result = await pool.query(
      'SELECT * FROM disable_ai_feature_by_admin($1, $2, $3, $4)',
      [auditId, adminUserId, feature, disabledUntil]
    );
    return result.rows[0] || null;
  }

  async enableAiFeature({ auditId, adminUserId, feature }) {
    const result = await pool.query(
      'SELECT * FROM enable_ai_feature_by_admin($1, $2, $3)',
      [auditId, adminUserId, feature]
    );
    return result.rows[0] || null;
  }

  async unsuspendUser({ auditId, adminUserId, userId }) {
    const result = await pool.query(
      'SELECT * FROM unsuspend_user_by_admin($1, $2, $3)',
      [auditId, adminUserId, userId]
    );
    return result.rows[0] || null;
  }
}

export { AdminOperationsQueries };
export default new AdminOperationsQueries();
