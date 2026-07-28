import { jest } from '@jest/globals';
import { AgentOrchestrator } from '../src/ai/orchestrators/agent.orchestrator.js';
import { FEATURE_FLAGS } from '../src/featureFlags/flags.js';

describe('AgentOrchestrator feature flags', () => {
  it('prevents booking tool execution when agent_booking is disabled', async () => {
    const executor = {
      executePlan: jest.fn().mockResolvedValue({
        success: true,
        steps: [],
        errors: [],
      }),
    };
    const featureFlagService = {
      isEnabled: jest.fn().mockResolvedValue(false),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue({ response: 'Booking unavailable.' }),
    };
    const orchestrator = new AgentOrchestrator({
      agent: {
        planner: {
          plan: jest.fn().mockResolvedValue({
            status: 'ready_to_book',
            steps: [{ tool: 'createReservation', arguments: {} }],
          }),
        },
        executor,
      },
      aiClient,
      featureFlagService,
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Book the selected tour.' },
    ], {
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'customer',
      authUser: { plan: 'PRO' },
    });

    expect(featureFlagService.isEnabled).toHaveBeenCalledWith({
      flag: FEATURE_FLAGS.AGENT_BOOKING,
      userId: 'user-1',
      anonymousId: 'conversation-1',
      personProperties: {
        plan: 'PRO',
        role: 'customer',
      },
    });
    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'booking_feature_unavailable',
        steps: [],
      }),
      expect.any(Object)
    );
  });
});
