import { jest } from '@jest/globals';
import {
  OperationalErrorsService,
} from '../src/services/admin/operationalErrors.service.js';

function buildService(overrides = {}) {
  return new OperationalErrorsService({
    repository: {
      getOperationalErrors: jest.fn().mockResolvedValue([]),
    },
    telemetry: {
      getOperationalErrors: jest.fn().mockReturnValue([]),
    },
    queueFailures: {
      getRecentFailures: jest.fn().mockResolvedValue([]),
    },
    traceResolver: {
      getTraceUrl: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  });
}

const range = {
  startAt: '2026-07-01T00:00:00.000Z',
  endAt: '2026-08-01T00:00:00.000Z',
};

const pagination = {
  page: 1,
  limit: 25,
  offset: 0,
};

describe('OperationalErrorsService', () => {
  it('aggregates all seven types, sorts newest first, and returns only safe fields', async () => {
    const repository = {
      getOperationalErrors: jest.fn().mockResolvedValue([
        {
          source_id: 'job-1',
          source_type: 'job',
          occurred_at: '2026-07-28T12:00:00.000Z',
          user_id: 42,
          trace_id: 'queue-trace',
          error_message: 'provider secret response',
        },
        {
          source_id: 'billing-1',
          source_type: 'billing',
          occurred_at: '2026-07-28T11:00:00.000Z',
          user_id: 7,
          event_data: { card: 'must-not-leak' },
        },
      ]),
    };
    const telemetry = {
      getOperationalErrors: jest.fn().mockReturnValue([
        { id: 'llm-1', timestamp: '2026-07-28T17:00:00.000Z', type: 'LLM_ERROR' },
        { id: 'tool-1', timestamp: '2026-07-28T16:00:00.000Z', type: 'TOOL_ERROR' },
        { id: 'rag-1', timestamp: '2026-07-28T15:00:00.000Z', type: 'RETRIEVAL_ERROR' },
        { id: 'output-1', timestamp: '2026-07-28T14:00:00.000Z', type: 'INVALID_OUTPUT' },
        { id: 'limit-1', timestamp: '2026-07-28T13:00:00.000Z', type: 'RATE_LIMIT' },
        { id: 'unknown-1', timestamp: '2026-07-28T18:00:00.000Z', type: 'UNKNOWN' },
      ]),
    };
    const service = buildService({ repository, telemetry });

    const result = await service.getErrors({ range, pagination });

    expect(result.errors.map((error) => error.type)).toEqual([
      'LLM_ERROR',
      'TOOL_ERROR',
      'RETRIEVAL_ERROR',
      'INVALID_OUTPUT',
      'RATE_LIMIT',
      'QUEUE_FAILURE',
      'PAYMENT_FAILURE',
    ]);
    expect(result.errors.find((error) => error.type === 'QUEUE_FAILURE')).toMatchObject({
      user: { id: '42', label: 'User 42' },
      message: 'Background job failed',
      status: 'failed',
    });
    expect(result.errors.find((error) => error.type === 'INVALID_OUTPUT')).toMatchObject({
      message: 'AI output was rejected',
      status: 'blocked',
    });
    expect(result.total).toBe(7);
    expect(JSON.stringify(result)).not.toContain('provider secret response');
    expect(JSON.stringify(result)).not.toContain('card');
  });

  it('deduplicates a persisted job and dead-letter record by original job ID', async () => {
    const service = buildService({
      repository: {
        getOperationalErrors: jest.fn().mockResolvedValue([{
          source_id: 'same-job',
          source_type: 'job',
          occurred_at: '2026-07-28T12:00:00.000Z',
          user_id: null,
          trace_id: null,
        }]),
      },
      queueFailures: {
        getRecentFailures: jest.fn().mockResolvedValue([{
          id: 'dlq-bird-identification-same-job',
          timestamp: '2026-07-28T12:01:00.000Z',
          type: 'QUEUE_FAILURE',
          dedupeKey: 'queue:same-job',
        }]),
      },
    });

    const result = await service.getErrors({ range, pagination });

    expect(result.total).toBe(1);
    expect(result.errors[0].id).toBe('dlq-bird-identification-same-job');
  });

  it('paginates after filtering and deduplication', async () => {
    const service = buildService({
      telemetry: {
        getOperationalErrors: jest.fn().mockReturnValue([
          { id: 'tool-3', timestamp: '2026-07-28T13:00:00.000Z', type: 'TOOL_ERROR' },
          { id: 'tool-2', timestamp: '2026-07-28T12:00:00.000Z', type: 'TOOL_ERROR' },
          { id: 'llm-1', timestamp: '2026-07-28T11:00:00.000Z', type: 'LLM_ERROR' },
          { id: 'tool-1', timestamp: '2026-07-28T10:00:00.000Z', type: 'TOOL_ERROR' },
        ]),
      },
    });

    const result = await service.getErrors({
      range,
      type: 'TOOL_ERROR',
      pagination: { page: 2, limit: 1, offset: 1 },
    });

    expect(result.total).toBe(3);
    expect(result.errors.map((error) => error.id)).toEqual(['tool-2']);
  });

  it('uses only validated LangSmith SDK URLs and supports missing traces', async () => {
    const traceResolver = {
      getTraceUrl: jest.fn()
        .mockResolvedValueOnce('https://smith.langchain.com/o/project/r/trace-safe')
        .mockResolvedValueOnce('https://smith.langchain.com.evil.test/r/trace-unsafe'),
    };
    const service = buildService({
      telemetry: {
        getOperationalErrors: jest.fn().mockReturnValue([
          {
            id: 'safe',
            timestamp: '2026-07-28T12:00:00.000Z',
            type: 'TOOL_ERROR',
            traceId: 'trace-safe',
          },
          {
            id: 'unsafe',
            timestamp: '2026-07-28T11:00:00.000Z',
            type: 'LLM_ERROR',
            traceId: 'trace-unsafe',
          },
          {
            id: 'missing',
            timestamp: '2026-07-28T10:00:00.000Z',
            type: 'RETRIEVAL_ERROR',
          },
        ]),
      },
      traceResolver,
    });

    const result = await service.getErrors({ range, pagination });

    expect(result.errors.map(({ id, traceId, traceUrl }) => ({ id, traceId, traceUrl }))).toEqual([
      {
        id: 'safe',
        traceId: 'trace-safe',
        traceUrl: 'https://smith.langchain.com/o/project/r/trace-safe',
      },
      {
        id: 'unsafe',
        traceId: 'trace-unsafe',
        traceUrl: null,
      },
      {
        id: 'missing',
        traceId: null,
        traceUrl: null,
      },
    ]);
  });

  it('fails the request when any source is unavailable', async () => {
    const service = buildService({
      queueFailures: {
        getRecentFailures: jest.fn().mockRejectedValue(new Error('redis password secret')),
      },
    });

    await expect(service.getErrors({ range, pagination })).rejects.toThrow('redis password secret');
  });
});
