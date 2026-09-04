import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const { AgentOrchestrator } = await import('../src/ai/orchestrators/agent.orchestrator.js');
const { ToolPlanner } = await import('../src/ai/planners/tool.planner.js');

function createOrchestrator({ extraction, replannedPlan }) {
  const planner = {
    plan: jest.fn()
      .mockReturnValueOnce({
        status: 'ready',
        steps: [{ tool: 'createReservation', args: { participants: 500 } }],
      })
      .mockReturnValue(replannedPlan || {
        status: 'ready',
        steps: [{ tool: 'createReservation', args: { participants: 500 } }],
      }),
  };
  const executor = {
    executePlan: jest.fn().mockResolvedValue({
      success: true,
      steps: [],
      errors: [],
      results: {},
    }),
  };
  const aiClient = {
    streamChatCompletion: jest.fn().mockResolvedValue('Please clarify your booking request.'),
  };
  const orchestrator = new AgentOrchestrator({
    agent: { planner, executor },
    aiClient,
    intentExtractor: {
      extract: jest.fn().mockResolvedValue(extraction),
    },
    experimentAssignments: {
      resolve: jest.fn(),
      getPersisted: jest.fn().mockResolvedValue(null),
    },
    featureFlagService: {
      getTemporaryDisable: jest.fn().mockResolvedValue(null),
      isEnabled: jest.fn().mockResolvedValue(true),
    },
    log: mockLogger,
  });

  return { orchestrator, planner, executor, aiClient };
}

describe('reservation intent orchestration boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['model refusal', {
      success: false,
      code: 'RESERVATION_INTENT_REFUSED',
      reason: 'model_refusal',
    }],
    ['invalid structured output', {
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'schema_validation_failed',
    }],
  ])('does not invoke business tools after %s', async (_label, extraction) => {
    const { orchestrator, executor } = createOrchestrator({ extraction });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Book a tour for me.' },
    ], { role: 'customer', conversationId: 'conversation-1' });

    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [],
        status: expect.stringMatching(/^intent_extraction_/),
      }),
      expect.any(Object)
    );
  });

  it('does not invoke business tools for a valid but unknown intent', async () => {
    const { orchestrator, executor } = createOrchestrator({
      extraction: {
        success: true,
        data: {
          intent: 'unknown',
          tourId: null,
          location: null,
          date: 'tomorrow',
          participants: null,
          transferRequired: null,
          pickupLocation: null,
          missingFields: [],
          confidence: 0.15,
        },
      },
    });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Maybe I want to go somewhere tomorrow.' },
      { role: 'user', content: 'Maybe book something.' },
    ], { role: 'customer', conversationId: 'conversation-2' });

    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'intent_unknown', steps: [] }),
      expect.any(Object)
    );
  });

  it('passes valid extraction to the planner but preserves business-layer rejection', async () => {
    const operationalFailure = {
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
      message: 'Only 8 seats are available.',
    };
    const { orchestrator, planner, executor } = createOrchestrator({
      extraction: {
        success: true,
        data: {
          intent: 'create_reservation',
          tourId: null,
          location: null,
          date: 'yesterday',
          participants: 500,
          transferRequired: null,
          pickupLocation: null,
          missingFields: ['tourId', 'location', 'transferRequired'],
          confidence: 0.99,
        },
      },
    });
    executor.executePlan.mockResolvedValue({
      success: false,
      steps: [],
      errors: [{ tool: 'createReservation', ...operationalFailure }],
      results: {},
    });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Book 500 seats for yesterday.' },
    ], { role: 'customer', conversationId: 'conversation-3' });

    expect(planner.plan).toHaveBeenLastCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        reservationIntent: expect.objectContaining({
          participants: 500,
          date: 'yesterday',
        }),
      }),
    }));
    expect(executor.executePlan).toHaveBeenCalled();
    await expect(executor.executePlan.mock.results[0].value).resolves.toMatchObject({
      success: false,
      errors: [expect.objectContaining({ code: 'INSUFFICIENT_AVAILABILITY' })],
    });
  });

  it('does not calculate transfer without an extracted pickup location', () => {
    const plan = new ToolPlanner().plan({
      message: 'Book the Monteverde tour for three people with transfer.',
      context: {
        reservationIntent: {
          intent: 'create_reservation',
          tourId: null,
          location: 'Monteverde',
          date: null,
          participants: 3,
          transferRequired: true,
          pickupLocation: null,
          missingFields: ['date', 'pickupLocation'],
          confidence: 0.95,
        },
      },
    });

    expect(plan.status).toBe('needs_clarification');
    expect(plan.message).toContain('pickup location');
    expect(plan.steps.map((step) => step.tool)).not.toContain('calculateTransfer');
  });
});
