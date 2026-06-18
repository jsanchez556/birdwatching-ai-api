import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: usageQueries } = await import('../src/db/queries/usage.queries.js');

describe('UsageQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a usage log row for a user', async () => {
    const usageLog = {
      user_id: 7,
      prompt_tokens: 1200,
      completion_tokens: 300,
      estimated_cost: '0.006000',
      created_at: new Date(),
    };
    mockQuery.mockResolvedValue({ rows: [usageLog] });

    await expect(usageQueries.createLog({
      userId: 7,
      promptTokens: 1200,
      completionTokens: 300,
      estimatedCost: 0.006,
    })).resolves.toBe(usageLog);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usage_logs'),
      [7, 1200, 300, 0.006]
    );
  });

  it('creates usage events with trace and model correlation data', async () => {
    const usageEvent = {
      id: '123',
      user_id: 7,
      feature: 'embedding',
      tokens: 42,
      estimated_cost: '0.000001',
      trace_id: 'trace-1',
      model_usage: [{ model: 'text-embedding-3-small', totalTokens: 42 }],
    };
    mockQuery.mockResolvedValue({ rows: [usageEvent] });

    await expect(usageQueries.createUsageEvent({
      userId: 7,
      feature: 'embedding',
      tokens: 42,
      estimatedCost: 0.000001,
      traceId: 'trace-1',
      modelUsage: usageEvent.model_usage,
    })).resolves.toBe(usageEvent);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM record_usage_event($1, $2, $3, $4, $5, $6)',
      [7, 'embedding', 42, 0.000001, 'trace-1', JSON.stringify(usageEvent.model_usage)]
    );
  });

  it('updates reserved usage events with trace and model correlation data', async () => {
    const usageEvent = {
      id: '123',
      user_id: 7,
      feature: 'chat',
      tokens: 220,
      estimated_cost: '0.002000',
      trace_id: 'trace-1',
      model_usage: [{ model: 'gpt-4o-mini', totalTokens: 220 }],
    };
    mockQuery.mockResolvedValue({ rows: [usageEvent] });

    await expect(usageQueries.updateUsageEventCost({
      usageEventId: 123,
      userId: 7,
      tokens: 220,
      estimatedCost: 0.002,
      traceId: 'trace-1',
      modelUsage: usageEvent.model_usage,
    })).resolves.toBe(usageEvent);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM update_usage_event_cost($1, $2, $3, $4, $5, $6)',
      [123, 7, 220, 0.002, 'trace-1', JSON.stringify(usageEvent.model_usage)]
    );
  });

  it('throws when the database insert fails', async () => {
    mockQuery.mockRejectedValue(new Error('Database error'));

    await expect(usageQueries.createLog({
      userId: 7,
      promptTokens: 1,
      completionTokens: 2,
      estimatedCost: null,
    })).rejects.toThrow('Database error');
  });
});
