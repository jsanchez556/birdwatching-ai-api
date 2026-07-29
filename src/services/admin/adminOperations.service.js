import adminOperationsRepository from '../../db/repositories/admin/adminOperations.repository.js';
import queueManager from '../../queues/queue.manager.js';
import featureFlags from '../../featureFlags/featureFlag.service.js';
import { FEATURE_FLAGS } from '../../featureFlags/flags.js';
import { getQueueNameForJobType, isKnownJobType } from '../../jobs/jobTypes.js';
import HttpError from '../../utils/httpError.js';
import logger from '../../utils/logger.js';

const ADMIN_ACTIONS = Object.freeze({
  RETRY_JOB: 'RETRY_FAILED_JOB',
  SUSPEND_USER: 'SUSPEND_USER',
  DISABLE_AI_FEATURE: 'DISABLE_AI_FEATURE',
  ENABLE_AI_FEATURE: 'ENABLE_AI_FEATURE',
  UNSUSPEND_USER: 'UNSUSPEND_USER',
});

const DISABLEABLE_AI_FEATURES = new Set([
  FEATURE_FLAGS.VOICE_AI,
  FEATURE_FLAGS.MULTIMODAL_BIRD_IDENTIFICATION,
  FEATURE_FLAGS.AGENT_BOOKING,
]);

function operationError(status, code, message) {
  return new HttpError(status, message, { code });
}

function safeFailureCode(error) {
  return error instanceof HttpError ? error.code : 'ADMIN_OPERATION_FAILED';
}

class AdminOperationsService {
  constructor({
    repository = adminOperationsRepository,
    queues = queueManager,
    featureFlagService = featureFlags,
    clock = () => new Date(),
    log = logger,
  } = {}) {
    this.repository = repository;
    this.queues = queues;
    this.featureFlags = featureFlagService;
    this.clock = clock;
    this.logger = log;
  }

  async beginAudit({ adminUserId, action, targetType, targetId, metadata = {} }) {
    const audit = await this.repository.createAuditLog({
      adminUserId,
      action,
      targetType,
      targetId: String(targetId),
      metadata: {
        outcome: 'attempted',
        ...metadata,
      },
    });

    if (!audit?.id) {
      throw operationError(503, 'AUDIT_LOG_UNAVAILABLE', 'Admin action could not be audited');
    }
    return audit;
  }

  async finalizeFailure(audit, adminUserId, error) {
    try {
      await this.repository.finalizeAuditLog({
        auditId: audit.id,
        adminUserId,
        metadata: {
          outcome: error instanceof HttpError ? 'rejected' : 'failed',
          errorCode: safeFailureCode(error),
        },
      });
    } catch {
      this.logger.error('Admin audit finalization failed', {
        action: audit.action,
        auditId: audit.id,
      });
    }
  }

  async retryFailedJob({ adminUserId, jobId }) {
    const audit = await this.beginAudit({
      adminUserId,
      action: ADMIN_ACTIONS.RETRY_JOB,
      targetType: 'bullmq_job',
      targetId: jobId,
    });

    try {
      const storedJob = await this.repository.getJobForAdmin({ jobId });
      if (!storedJob) {
        throw operationError(404, 'JOB_NOT_FOUND', 'Job not found');
      }
      if (storedJob.status !== 'failed' || !isKnownJobType(storedJob.job_type)) {
        throw operationError(409, 'JOB_NOT_RETRYABLE', 'Only failed known jobs can be retried');
      }

      const queueName = getQueueNameForJobType(storedJob.job_type);
      const queue = this.queues.getQueue(queueName);
      const job = await queue.getJob(jobId);
      if (!job || await job.getState() !== 'failed') {
        throw operationError(409, 'JOB_NOT_RETRYABLE', 'The live queue job is not failed');
      }

      await job.retry('failed');
      try {
        await this.repository.finalizeAuditLog({
          auditId: audit.id,
          adminUserId,
          metadata: {
            outcome: 'succeeded',
            jobType: storedJob.job_type,
            queueName,
          },
        });
      } catch {
        this.logger.error('Admin audit finalization failed', {
          action: audit.action,
          auditId: audit.id,
        });
      }

      return {
        auditId: String(audit.id),
        job: {
          id: String(jobId),
          type: storedJob.job_type,
          queue: queueName,
          status: 'queued',
        },
      };
    } catch (error) {
      await this.finalizeFailure(audit, adminUserId, error);
      throw error;
    }
  }

  async suspendUser({ adminUserId, userId, reasonCode }) {
    const audit = await this.beginAudit({
      adminUserId,
      action: ADMIN_ACTIONS.SUSPEND_USER,
      targetType: 'user',
      targetId: userId,
      metadata: { reasonCode },
    });

    try {
      const result = await this.repository.suspendUser({
        auditId: audit.id,
        adminUserId,
        userId,
        reasonCode,
      });
      if (!result) {
        throw operationError(404, 'USER_NOT_FOUND', 'User not found');
      }

      return {
        auditId: String(audit.id),
        user: {
          id: String(result.user_id),
          status: 'suspended',
          suspendedAt: new Date(result.suspended_at).toISOString(),
          reasonCode: result.reason_code,
        },
      };
    } catch (error) {
      const mapped = error?.message === 'TARGET_USER_NOT_FOUND'
        ? operationError(404, 'USER_NOT_FOUND', 'User not found')
        : error?.message === 'ADMIN_USER_SUSPENSION_FORBIDDEN'
          ? operationError(409, 'ADMIN_USER_SUSPENSION_FORBIDDEN', 'Admin users cannot be suspended')
          : error;
      await this.finalizeFailure(audit, adminUserId, mapped);
      throw mapped;
    }
  }

  async disableAiFeature({
    adminUserId,
    feature,
    durationMinutes,
  }) {
    const audit = await this.beginAudit({
      adminUserId,
      action: ADMIN_ACTIONS.DISABLE_AI_FEATURE,
      targetType: 'ai_feature',
      targetId: feature,
      metadata: { durationMinutes },
    });

    try {
      if (!DISABLEABLE_AI_FEATURES.has(feature)) {
        throw operationError(422, 'FEATURE_NOT_DISABLEABLE', 'AI feature cannot be disabled');
      }
      const disabledUntil = new Date(
        this.clock().getTime() + (durationMinutes * 60 * 1000)
      ).toISOString();
      const result = await this.repository.disableAiFeature({
        auditId: audit.id,
        adminUserId,
        feature,
        disabledUntil,
      });
      this.featureFlags.rememberDisabled?.(feature, disabledUntil);

      return {
        auditId: String(audit.id),
        feature: {
          name: result.feature,
          status: 'disabled',
          disabledUntil: new Date(result.disabled_until).toISOString(),
        },
      };
    } catch (error) {
      await this.finalizeFailure(audit, adminUserId, error);
      throw error;
    }
  }

  async getAiFeatureStates() {
    const rows = await this.repository.getAiFeatureStates({
      features: [...DISABLEABLE_AI_FEATURES],
    });
    const byFeature = new Map(rows.map((row) => [row.feature, row.disabled_until]));

    return {
      features: [...DISABLEABLE_AI_FEATURES].map((feature) => {
        const disabledUntil = byFeature.get(feature);
        return {
          name: feature,
          status: disabledUntil ? 'disabled' : 'enabled',
          enabled: !disabledUntil,
          disabledUntil: disabledUntil ? new Date(disabledUntil).toISOString() : null,
        };
      }),
    };
  }

  async enableAiFeature({ adminUserId, feature }) {
    const audit = await this.beginAudit({
      adminUserId,
      action: ADMIN_ACTIONS.ENABLE_AI_FEATURE,
      targetType: 'ai_feature',
      targetId: feature,
    });

    try {
      if (!DISABLEABLE_AI_FEATURES.has(feature)) {
        throw operationError(422, 'FEATURE_NOT_ENABLEABLE', 'AI feature cannot be enabled');
      }
      const result = await this.repository.enableAiFeature({
        auditId: audit.id,
        adminUserId,
        feature,
      });
      this.featureFlags.rememberEnabled?.(feature);
      return {
        auditId: String(audit.id),
        feature: {
          name: result.feature,
          status: 'enabled',
          disabledUntil: null,
        },
      };
    } catch (error) {
      await this.finalizeFailure(audit, adminUserId, error);
      throw error;
    }
  }

  async unsuspendUser({ adminUserId, userId }) {
    const audit = await this.beginAudit({
      adminUserId,
      action: ADMIN_ACTIONS.UNSUSPEND_USER,
      targetType: 'user',
      targetId: userId,
    });

    try {
      const result = await this.repository.unsuspendUser({
        auditId: audit.id,
        adminUserId,
        userId,
      });
      return {
        auditId: String(audit.id),
        user: {
          id: String(result.user_id),
          status: 'active',
          suspendedAt: null,
          reasonCode: null,
        },
      };
    } catch (error) {
      const mapped = error?.message === 'TARGET_USER_NOT_FOUND'
        ? operationError(404, 'USER_NOT_FOUND', 'User not found')
        : error?.message === 'ADMIN_USER_UNSUSPENSION_FORBIDDEN'
          ? operationError(409, 'ADMIN_USER_UNSUSPENSION_FORBIDDEN', 'Admin users cannot be reactivated')
          : error;
      await this.finalizeFailure(audit, adminUserId, mapped);
      throw mapped;
    }
  }
}

export {
  ADMIN_ACTIONS,
  AdminOperationsService,
  DISABLEABLE_AI_FEATURES,
};
export default new AdminOperationsService();
