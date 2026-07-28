import { jest } from '@jest/globals';
import {
  AI_TRACE_HEADER,
  createAiTraceMiddleware,
} from '../src/api/middleware/aiTrace.middleware.js';

describe('AI trace middleware', () => {
  it('generates a server-owned trace ID and exposes it on the response', () => {
    const req = {
      headers: {
        'x-ai-trace-id': 'untrusted-client-value',
      },
    };
    const res = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();
    const middleware = createAiTraceMiddleware({
      idFactory: () => '11111111-1111-4111-8111-111111111111',
    });

    middleware(req, res, next);

    expect(req.aiTraceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.setHeader).toHaveBeenCalledWith(
      AI_TRACE_HEADER,
      '11111111-1111-4111-8111-111111111111'
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
