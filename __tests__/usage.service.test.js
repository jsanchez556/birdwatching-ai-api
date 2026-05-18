import { jest } from '@jest/globals';

const mockCreateLog = jest.fn();

await jest.unstable_mockModule('../src/db/queries/usage.queries.js', () => ({
  default: {
    createLog: mockCreateLog,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: usageService } = await import('../src/services/usage.service.js');

describe('UsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records OpenAI usage for an authenticated user', async () => {
    const savedLog = { user_id: 7 };
    mockCreateLog.mockResolvedValue(savedLog);

    await expect(usageService.recordOpenAiUsage('7', {
      promptTokens: 123.8,
      completionTokens: 45,
      estimatedCostUsd: 0.001234,
      hasEstimatedCost: true,
    })).resolves.toBe(savedLog);

    expect(mockCreateLog).toHaveBeenCalledWith({
      userId: 7,
      promptTokens: 123,
      completionTokens: 45,
      estimatedCost: 0.001234,
    });
  });

  it('skips unauthenticated usage', async () => {
    await expect(usageService.recordOpenAiUsage(null, {
      promptTokens: 10,
      completionTokens: 10,
    })).resolves.toBeNull();

    expect(mockCreateLog).not.toHaveBeenCalled();
  });

  it('keeps chat resilient when persistence fails', async () => {
    mockCreateLog.mockRejectedValue(new Error('Database down'));

    await expect(usageService.recordOpenAiUsage(7, {
      promptTokens: 10,
      completionTokens: 10,
      hasEstimatedCost: false,
    })).resolves.toBeNull();
  });
});
