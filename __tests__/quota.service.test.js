import { jest } from '@jest/globals';

const mockReserveDailyUsage = jest.fn();

await jest.unstable_mockModule('../src/db/queries/quota.queries.js', () => ({
  default: {
    reserveDailyUsage: mockReserveDailyUsage,
  },
}));

const {
  default: quotaService,
  QUOTA_FEATURES,
  buildQuotaMessage,
  normalizeUserId,
} = await import('../src/services/quota.service.js');

describe('QuotaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes numeric user IDs before reserving daily chat usage', async () => {
    const reservation = {
      allowed: true,
      usageEventId: 'usage-1',
      plan: 'FREE',
      feature: 'chat',
      used: 1,
      max: 20,
    };
    mockReserveDailyUsage.mockResolvedValue(reservation);

    await expect(quotaService.reserveUsage({
      userId: '7',
      feature: QUOTA_FEATURES.CHAT,
    })).resolves.toBe(reservation);

    expect(mockReserveDailyUsage).toHaveBeenCalledWith({
      userId: 7,
      feature: 'chat',
    });
  });

  it('skips quota reservation for unauthenticated requests', async () => {
    await expect(quotaService.reserveUsage({
      userId: null,
      feature: QUOTA_FEATURES.CHAT,
    })).resolves.toBeNull();

    expect(mockReserveDailyUsage).not.toHaveBeenCalled();
  });

  it('throws a structured 429 error when the daily quota is exhausted', async () => {
    mockReserveDailyUsage.mockResolvedValue({
      allowed: false,
      usageEventId: null,
      plan: 'FREE',
      feature: 'identification',
      used: 5,
      max: 5,
    });

    await expect(quotaService.reserveUsage({
      userId: 7,
      feature: QUOTA_FEATURES.IDENTIFICATION,
    })).rejects.toMatchObject({
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'Daily quota exceeded',
      details: {
        plan: 'FREE',
        feature: 'identification',
        used: 5,
        max: 5,
      },
    });
  });

  it('treats a missing reservation row as quota exhaustion with safe details', async () => {
    mockReserveDailyUsage.mockResolvedValue(null);

    await expect(quotaService.reserveUsage({
      userId: 7,
      feature: QUOTA_FEATURES.CHAT,
    })).rejects.toMatchObject({
      status: 429,
      code: 'QUOTA_EXCEEDED',
      details: {
        plan: undefined,
        feature: 'chat',
        used: undefined,
        max: undefined,
      },
    });
  });

  it('normalizes helper values used by quota reservations', () => {
    expect(normalizeUserId('42')).toBe(42);
    expect(normalizeUserId('not-a-number')).toBeNull();
    expect(buildQuotaMessage({})).toBe('Daily quota exceeded');
  });
});
