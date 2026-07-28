import { jest } from '@jest/globals';
import { AiTelemetry } from '../src/monitoring/aiTelemetry.js';

describe('AI operational error telemetry', () => {
  it('maps known trace and monitored events without classifying unknown events', () => {
    const telemetry = new AiTelemetry({
      log: { info: jest.fn(), warn: jest.fn() },
      clock: { now: () => Date.parse('2026-07-28T12:00:00.000Z') },
      idFactory: jest.fn()
        .mockReturnValueOnce('error-1')
        .mockReturnValueOnce('error-2')
        .mockReturnValueOnce('error-3'),
    });

    telemetry.recordError({
      id: 'trace-llm',
      type: 'llm',
      metadata: { userId: 42 },
    }, Object.assign(new Error('secret provider response'), { status: 429 }));
    telemetry.recordAiError('tool_failed', {
      userId: 7,
      aiTraceId: 'trace-tool',
      error: { message: 'secret tool args' },
    });
    telemetry.recordAiError('prompt_evaluation_tracked', { traceId: 'not-an-error' });

    expect(telemetry.getOperationalErrors()).toEqual([
      {
        id: 'telemetry-error-2',
        timestamp: '2026-07-28T12:00:00.000Z',
        type: 'TOOL_ERROR',
        userId: '7',
        traceId: 'trace-tool',
        sourceEvent: 'tool_failed',
      },
      {
        id: 'telemetry-error-1',
        timestamp: '2026-07-28T12:00:00.000Z',
        type: 'RATE_LIMIT',
        userId: '42',
        traceId: 'trace-llm',
        sourceEvent: 'ai_trace_failed',
      },
    ]);
  });

  it('keeps a bounded in-memory error history and clears it on reset', () => {
    const telemetry = new AiTelemetry({
      log: { info: jest.fn(), warn: jest.fn() },
      maxOperationalErrors: 2,
      idFactory: jest.fn()
        .mockReturnValueOnce('1')
        .mockReturnValueOnce('2')
        .mockReturnValueOnce('3'),
    });

    telemetry.recordAiError('tool_failed');
    telemetry.recordAiError('retrieval_failed');
    telemetry.recordAiError('invalid_output');

    expect(telemetry.getOperationalErrors()).toHaveLength(2);
    telemetry.reset();
    expect(telemetry.getOperationalErrors()).toEqual([]);
  });
});
