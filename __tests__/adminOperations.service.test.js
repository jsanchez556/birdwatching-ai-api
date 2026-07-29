import { jest } from '@jest/globals';
import {
  ADMIN_ACTIONS,
  AdminOperationsService,
} from '../src/services/admin/adminOperations.service.js';

function buildRepository() {
  return {
    createAuditLog: jest.fn()
      .mockImplementation(({ action }) => Promise.resolve({ id: 41, action })),
    finalizeAuditLog: jest.fn().mockResolvedValue({ id: 41 }),
    getJobForAdmin: jest.fn(),
    suspendUser: jest.fn(),
    disableAiFeature: jest.fn(),
    enableAiFeature: jest.fn(),
    unsuspendUser: jest.fn(),
    getAiFeatureStates: jest.fn(),
  };
}

describe('AdminOperationsService', () => {
  const now = new Date('2026-07-29T12:00:00.000Z');

  it('retries only a live failed BullMQ job and records safe audit metadata', async () => {
    const repository = buildRepository();
    repository.getJobForAdmin.mockResolvedValue({
      job_id: 'job-1',
      job_type: 'embedding',
      status: 'failed',
    });
    const job = {
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { getJob: jest.fn().mockResolvedValue(job) };
    const queues = { getQueue: jest.fn().mockReturnValue(queue) };
    const service = new AdminOperationsService({ repository, queues });

    await expect(service.retryFailedJob({
      adminUserId: 1,
      jobId: 'job-1',
    })).resolves.toEqual({
      auditId: '41',
      job: {
        id: 'job-1',
        type: 'embedding',
        queue: 'embedding',
        status: 'queued',
      },
    });

    expect(repository.createAuditLog).toHaveBeenCalledWith({
      adminUserId: 1,
      action: ADMIN_ACTIONS.RETRY_JOB,
      targetType: 'bullmq_job',
      targetId: 'job-1',
      metadata: { outcome: 'attempted' },
    });
    expect(job.retry).toHaveBeenCalledWith('failed');
    expect(repository.finalizeAuditLog).toHaveBeenCalledWith({
      auditId: 41,
      adminUserId: 1,
      metadata: {
        outcome: 'succeeded',
        jobType: 'embedding',
        queueName: 'embedding',
      },
    });
  });

  it('rejects a non-failed job, does not retry it, and finalizes the audit as rejected', async () => {
    const repository = buildRepository();
    repository.getJobForAdmin.mockResolvedValue({
      job_id: 'job-1',
      job_type: 'embedding',
      status: 'completed',
    });
    const queues = { getQueue: jest.fn() };
    const service = new AdminOperationsService({ repository, queues });

    await expect(service.retryFailedJob({
      adminUserId: 1,
      jobId: 'job-1',
    })).rejects.toMatchObject({
      status: 409,
      code: 'JOB_NOT_RETRYABLE',
    });
    expect(queues.getQueue).not.toHaveBeenCalled();
    expect(repository.finalizeAuditLog).toHaveBeenCalledWith({
      auditId: 41,
      adminUserId: 1,
      metadata: {
        outcome: 'rejected',
        errorCode: 'JOB_NOT_RETRYABLE',
      },
    });
  });

  it('fails closed before a job mutation when the audit log is unavailable', async () => {
    const repository = buildRepository();
    repository.createAuditLog.mockResolvedValue(null);
    const queues = { getQueue: jest.fn() };
    const service = new AdminOperationsService({ repository, queues });

    await expect(service.retryFailedJob({
      adminUserId: 1,
      jobId: 'job-1',
    })).rejects.toMatchObject({
      status: 503,
      code: 'AUDIT_LOG_UNAVAILABLE',
    });
    expect(repository.getJobForAdmin).not.toHaveBeenCalled();
    expect(queues.getQueue).not.toHaveBeenCalled();
  });

  it('suspends a non-admin user through the audited database operation', async () => {
    const repository = buildRepository();
    repository.suspendUser.mockResolvedValue({
      user_id: 7,
      suspended_at: now,
      reason_code: 'abuse',
    });
    const service = new AdminOperationsService({ repository });

    await expect(service.suspendUser({
      adminUserId: 1,
      userId: 7,
      reasonCode: 'abuse',
    })).resolves.toEqual({
      auditId: '41',
      user: {
        id: '7',
        status: 'suspended',
        suspendedAt: now.toISOString(),
        reasonCode: 'abuse',
      },
    });
    expect(repository.suspendUser).toHaveBeenCalledWith({
      auditId: 41,
      adminUserId: 1,
      userId: 7,
      reasonCode: 'abuse',
    });
  });

  it('temporarily disables an allowlisted AI feature and updates the local safety cache', async () => {
    const repository = buildRepository();
    const disabledUntil = '2026-07-29T12:30:00.000Z';
    repository.disableAiFeature.mockResolvedValue({
      feature: 'voice_ai',
      disabled_until: disabledUntil,
    });
    const featureFlagService = { rememberDisabled: jest.fn() };
    const service = new AdminOperationsService({
      repository,
      featureFlagService,
      clock: () => now,
    });

    await expect(service.disableAiFeature({
      adminUserId: 1,
      feature: 'voice_ai',
      durationMinutes: 30,
    })).resolves.toEqual({
      auditId: '41',
      feature: {
        name: 'voice_ai',
        status: 'disabled',
        disabledUntil,
      },
    });
    expect(repository.disableAiFeature).toHaveBeenCalledWith({
      auditId: 41,
      adminUserId: 1,
      feature: 'voice_ai',
      disabledUntil,
    });
    expect(featureFlagService.rememberDisabled).toHaveBeenCalledWith(
      'voice_ai',
      disabledUntil
    );
  });

  it('audits and rejects a feature outside the emergency allowlist', async () => {
    const repository = buildRepository();
    const service = new AdminOperationsService({ repository });

    await expect(service.disableAiFeature({
      adminUserId: 1,
      feature: 'unknown_ai',
      durationMinutes: 30,
    })).rejects.toMatchObject({
      status: 422,
      code: 'FEATURE_NOT_DISABLEABLE',
    });
    expect(repository.disableAiFeature).not.toHaveBeenCalled();
    expect(repository.finalizeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          outcome: 'rejected',
          errorCode: 'FEATURE_NOT_DISABLEABLE',
        },
      })
    );
  });

  it('immediately enables a feature through an idempotent audited operation', async () => {
    const repository = buildRepository();
    repository.enableAiFeature.mockResolvedValue({ feature: 'voice_ai' });
    const featureFlagService = { rememberEnabled: jest.fn() };
    const service = new AdminOperationsService({ repository, featureFlagService });

    await expect(service.enableAiFeature({
      adminUserId: 1,
      feature: 'voice_ai',
    })).resolves.toEqual({
      auditId: '41',
      feature: { name: 'voice_ai', status: 'enabled', disabledUntil: null },
    });
    expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: ADMIN_ACTIONS.ENABLE_AI_FEATURE,
    }));
    expect(featureFlagService.rememberEnabled).toHaveBeenCalledWith('voice_ai');
  });

  it('reactivates an eligible user and returns only safe suspension state', async () => {
    const repository = buildRepository();
    repository.unsuspendUser.mockResolvedValue({
      user_id: 7,
      suspended_at: null,
      reason_code: null,
    });
    const service = new AdminOperationsService({ repository });

    await expect(service.unsuspendUser({ adminUserId: 1, userId: 7 })).resolves.toEqual({
      auditId: '41',
      user: { id: '7', status: 'active', suspendedAt: null, reasonCode: null },
    });
    expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: ADMIN_ACTIONS.UNSUSPEND_USER,
    }));
  });

  it('reports authoritative current feature controls with UTC expirations', async () => {
    const repository = buildRepository();
    repository.getAiFeatureStates.mockResolvedValue([
      { feature: 'agent_booking', disabled_until: now },
      { feature: 'multimodal_bird_identification', disabled_until: null },
      { feature: 'voice_ai', disabled_until: null },
    ]);
    const service = new AdminOperationsService({ repository });
    const result = await service.getAiFeatureStates();
    expect(result.features).toEqual(expect.arrayContaining([
      {
        name: 'agent_booking',
        enabled: false,
        status: 'disabled',
        disabledUntil: now.toISOString(),
      },
      {
        name: 'voice_ai',
        enabled: true,
        status: 'enabled',
        disabledUntil: null,
      },
    ]));
  });
});
