import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

const { default: queries } = await import('../src/db/queries/adminOperations.queries.js');

describe('admin operations queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{}] });
  });

  it('creates audit entries through a parameterized database function', async () => {
    await queries.createAuditLog({
      adminUserId: 1,
      action: 'RETRY_FAILED_JOB',
      targetType: 'bullmq_job',
      targetId: 'job-1',
      metadata: { outcome: 'attempted' },
    });

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(sql).toContain('create_admin_audit_log');
    expect(parameters).toEqual([
      1,
      'RETRY_FAILED_JOB',
      'bullmq_job',
      'job-1',
      JSON.stringify({ outcome: 'attempted' }),
    ]);
  });

  it('loads only safe job identity and state fields', async () => {
    await queries.getJobForAdmin({ jobId: 'job-1' });

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(parameters).toEqual(['job-1']);
    expect(sql).toContain('job_id, job_type, status');
    expect(sql).not.toContain('request_params');
    expect(sql).not.toContain('error_message');
    expect(sql).not.toContain('result_meta');
  });

  it('uses database functions for audited user and feature mutations', async () => {
    await queries.suspendUser({
      auditId: 9,
      adminUserId: 1,
      userId: 7,
      reasonCode: 'abuse',
    });
    await queries.disableAiFeature({
      auditId: 10,
      adminUserId: 1,
      feature: 'voice_ai',
      disabledUntil: '2026-07-29T13:00:00.000Z',
    });
    await queries.enableAiFeature({
      auditId: 11,
      adminUserId: 1,
      feature: 'voice_ai',
    });
    await queries.unsuspendUser({
      auditId: 12,
      adminUserId: 1,
      userId: 7,
    });

    expect(mockQuery.mock.calls[0]).toEqual([
      'SELECT * FROM suspend_user_by_admin($1, $2, $3, $4)',
      [9, 1, 7, 'abuse'],
    ]);
    expect(mockQuery.mock.calls[1]).toEqual([
      'SELECT * FROM disable_ai_feature_by_admin($1, $2, $3, $4)',
      [10, 1, 'voice_ai', '2026-07-29T13:00:00.000Z'],
    ]);
    expect(mockQuery.mock.calls[2]).toEqual([
      'SELECT * FROM enable_ai_feature_by_admin($1, $2, $3)',
      [11, 1, 'voice_ai'],
    ]);
    expect(mockQuery.mock.calls[3]).toEqual([
      'SELECT * FROM unsuspend_user_by_admin($1, $2, $3)',
      [12, 1, 7],
    ]);
  });
});
