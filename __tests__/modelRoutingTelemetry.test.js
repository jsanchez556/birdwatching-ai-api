import { jest } from '@jest/globals';
import { executeModelRoute } from '../src/ai/utils/modelRouteExecution.utils.js';
import {
  ModelRoutingTelemetry,
} from '../src/ai/telemetry/modelRoutingTelemetry.js';

const route = (overrides = {}) => ({
  task: 'general_chat',
  route: 'balanced',
  reasonCode: 'BALANCED_CONVERSATION',
  primaryModel: { key: 'balanced_general', modelId: 'gpt-4o' },
  fallbackModels: [{ key: 'economy_fast', modelId: 'gpt-4o-mini' }],
  timeoutMs: 10_000,
  maxRetries: 0,
  ...overrides,
});

function transientError() {
  return Object.assign(new Error('raw provider outage must not be exported'), { status: 503 });
}

function harness() {
  const operationalTelemetry = {
    recordModelRoutingExecution: jest.fn(),
  };
  const analytics = {
    track: jest.fn(() => true),
  };
  const observability = {
    recordModelRoutingExecution: jest.fn().mockResolvedValue(undefined),
  };
  const clock = {
    now: jest.fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_240),
  };
  const executionTelemetry = new ModelRoutingTelemetry({
    operationalTelemetry,
    analyticsService: analytics,
    observabilityService: observability,
    idFactory: () => 'routing-execution-1',
    clock,
  });
  return { analytics, executionTelemetry, observability, operationalTelemetry };
}

function finalRecord(testHarness) {
  return testHarness.operationalTelemetry.recordModelRoutingExecution.mock.calls[0][0];
}

describe('normalized model-routing execution telemetry', () => {
  it('records one priced primary-model success and one privacy-safe impact event', async () => {
    const testHarness = harness();
    const metadata = {
      userId: 7,
      conversationId: 'conversation-1',
      customerEmail: 'private@example.test',
      prompt: 'private prompt',
      response: 'private response',
    };

    await executeModelRoute({
      modelRoute: route(),
      metadata,
      executionTelemetry: testHarness.executionTelemetry,
      executeAttempt: async ({ attemptContext }) => {
        attemptContext.providerModel = 'gpt-4o';
        attemptContext.tokenUsage = {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
        };
        attemptContext.schemaValidation = { success: true, errorCode: null };
        return 'usable response';
      },
    });

    expect(finalRecord(testHarness)).toMatchObject({
      executionId: 'routing-execution-1',
      canonical: {
        requestedTask: 'general_chat',
        selectedModel: 'gpt-4o',
        fallbackModel: null,
        reason: 'BALANCED_CONVERSATION',
        latency: 240,
        tokens: { input: 100, output: 20, total: 120 },
        cost: 0.00045,
        retryCount: 0,
        schemaValidation: { success: true, errorCode: null },
        degradedMode: false,
        success: true,
      },
      dimensions: {
        routingTier: 'balanced',
        finalModel: 'gpt-4o',
        userVisibleSuccess: true,
        conversionOutcome: 'none',
      },
    });
    expect(testHarness.operationalTelemetry.recordModelRoutingExecution).toHaveBeenCalledTimes(1);
    expect(testHarness.analytics.track).toHaveBeenCalledTimes(1);
    expect(testHarness.observability.recordModelRoutingExecution)
      .toHaveBeenCalledWith(expect.objectContaining({ executionId: 'routing-execution-1' }));
    const event = testHarness.analytics.track.mock.calls[0][0];
    expect(event).toMatchObject({
      event: 'model_routing_outcome',
      idempotencyKey: 'routing-execution-1',
      properties: {
        executionId: 'routing-execution-1',
        taskCategory: 'general_chat',
        routingTier: 'balanced',
        degradedMode: false,
        userVisibleSuccess: true,
        conversionOutcome: 'none',
        retryBucket: 'none',
        fallbackBucket: 'none',
      },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /private prompt|private response|private@example|customerEmail|prompt|response|raw provider/i
    );
  });

  it('distinguishes a same-model retry from a cross-model fallback', async () => {
    const retryHarness = harness();
    const retryAttempt = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue('ok');

    await executeModelRoute({
      modelRoute: route({ maxRetries: 1 }),
      executeAttempt: retryAttempt,
      executionTelemetry: retryHarness.executionTelemetry,
      baseDelayMs: 0,
      jitterRatio: 0,
    });

    expect(finalRecord(retryHarness).canonical).toMatchObject({
      retryCount: 1,
      fallbackModel: null,
      success: true,
    });

    const fallbackHarness = harness();
    await executeModelRoute({
      modelRoute: route(),
      executeAttempt: jest.fn()
        .mockRejectedValueOnce(transientError())
        .mockResolvedValue('ok'),
      executionTelemetry: fallbackHarness.executionTelemetry,
    });

    expect(finalRecord(fallbackHarness).canonical).toMatchObject({
      retryCount: 0,
      fallbackModel: 'gpt-4o-mini',
      degradedMode: true,
      success: true,
    });
    expect(finalRecord(fallbackHarness).attempts.map((attempt) => attempt.attemptRole))
      .toEqual(['primary', 'fallback']);
    expect(finalRecord(fallbackHarness).attempts[1].fallbackReason)
      .toBe('service_unavailable');
  });

  it('records exhausted routes and bounded schema-validation failures', async () => {
    const exhaustedHarness = harness();

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt: jest.fn().mockRejectedValue(transientError()),
      executionTelemetry: exhaustedHarness.executionTelemetry,
    })).rejects.toMatchObject({ code: 'MODEL_ROUTES_EXHAUSTED' });

    expect(finalRecord(exhaustedHarness).canonical).toMatchObject({
      success: false,
      retryCount: 0,
    });
    expect(exhaustedHarness.analytics.track).toHaveBeenCalledTimes(1);

    const validationHarness = harness();
    await expect(executeModelRoute({
      modelRoute: route(),
      executionTelemetry: validationHarness.executionTelemetry,
      executeAttempt: jest.fn().mockImplementation(({ attemptContext }) => {
        attemptContext.schemaValidation = {
          success: false,
          errorCode: 'not-a-permitted-code',
        };
        throw Object.assign(new Error('raw invalid output'), {
          code: 'provider_malformed_response',
        });
      }),
    })).rejects.toMatchObject({ code: 'MODEL_ROUTES_EXHAUSTED' });

    expect(finalRecord(validationHarness).canonical.schemaValidation).toEqual({
      success: false,
      errorCode: 'unknown_validation_failure',
    });
  });

  it('represents degraded success and unavailable usage or pricing without fabrication', async () => {
    const missingHarness = harness();
    await executeModelRoute({
      modelRoute: route(),
      degradedMode: true,
      executeAttempt: jest.fn().mockResolvedValue('limited but usable'),
      executionTelemetry: missingHarness.executionTelemetry,
    });
    expect(finalRecord(missingHarness).canonical).toMatchObject({
      degradedMode: true,
      success: true,
      tokens: null,
      cost: null,
    });

    const unpricedHarness = harness();
    await executeModelRoute({
      modelRoute: route({
        primaryModel: { key: 'custom_model', modelId: 'unpriced-model' },
      }),
      executeAttempt: async ({ attemptContext }) => {
        attemptContext.tokenUsage = { input_tokens: 5, output_tokens: 2, total_tokens: 7 };
        return 'ok';
      },
      executionTelemetry: unpricedHarness.executionTelemetry,
    });
    expect(finalRecord(unpricedHarness).canonical).toMatchObject({
      tokens: { input: 5, output: 2, total: 7 },
      cost: null,
    });
  });

  it('keeps LangSmith and PostHog outages off the primary request path', async () => {
    const testHarness = harness();
    testHarness.analytics.track.mockImplementation(() => {
      throw new Error('PostHog unavailable');
    });
    testHarness.observability.recordModelRoutingExecution
      .mockRejectedValue(new Error('LangSmith unavailable'));

    await expect(executeModelRoute({
      modelRoute: route(),
      executeAttempt: jest.fn().mockResolvedValue('ok'),
      executionTelemetry: testHarness.executionTelemetry,
    })).resolves.toBe('ok');

    expect(testHarness.operationalTelemetry.recordModelRoutingExecution).toHaveBeenCalledTimes(1);
    expect(testHarness.analytics.track).toHaveBeenCalledTimes(1);
    expect(testHarness.observability.recordModelRoutingExecution).toHaveBeenCalledTimes(1);
  });
});
