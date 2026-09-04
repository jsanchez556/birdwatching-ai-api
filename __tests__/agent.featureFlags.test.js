import { jest } from '@jest/globals';
import { AgentOrchestrator } from '../src/ai/orchestrators/agent.orchestrator.js';
import { FEATURE_FLAGS } from '../src/featureFlags/flags.js';

function createValidIntentExtractor(intent) {
  return {
    extract: jest.fn().mockResolvedValue({
      success: true,
      data: {
        intent,
        tourId: null,
        location: null,
        date: null,
        participants: null,
        transferRequired: null,
        pickupLocation: null,
        missingFields: [],
        confidence: 1,
      },
    }),
  };
}

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
      intentExtractor: createValidIntentExtractor('create_reservation'),
      featureFlagService,
      experimentAssignments: {
        getPersisted: jest.fn().mockResolvedValue(null),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    const metadata = {
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'customer',
      authUser: { plan: 'PRO' },
    };
    const response = await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Book the selected tour.' },
    ], metadata);

    expect(featureFlagService.isEnabled).toHaveBeenCalledWith({
      flag: FEATURE_FLAGS.AGENT_BOOKING,
      userId: 'user-1',
      anonymousId: 'conversation-1',
      personProperties: {
        plan: 'PRO',
        role: 'customer',
      },
    });
    expect(executor.executePlan).not.toHaveBeenCalled();
    expect(aiClient.streamChatCompletion).not.toHaveBeenCalled();
    expect(response).toContain('no reservation has been confirmed');
    expect(metadata).toMatchObject({
      degradedMode: true,
      unavailableCapabilities: ['reservation_tool'],
    });
    expect(metadata.reservation).toBeUndefined();
  });

  it('injects a stable tour recommendation prompt assignment into LLM metadata', async () => {
    const metadata = {
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'customer',
      authUser: { plan: 'PRO' },
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue({
        success: true,
        steps: [{
          tool: 'searchTours',
          result: { success: true, tours: [{ tourId: 1 }] },
        }],
        errors: [],
      }),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('I found one matching tour.'),
    };
    const experimentAssignments = {
      resolve: jest.fn().mockResolvedValue({
        experiment: 'tour_recommendation_prompt',
        variant: 'recommendation_prompt_v2',
      }),
    };
    const orchestrator = new AgentOrchestrator({
      agent: {
        planner: {
          plan: jest.fn().mockResolvedValue({
            status: 'recommendations',
            steps: [{
              tool: 'searchTours',
              args: { recommend: true, limit: 3 },
            }],
          }),
        },
        executor,
      },
      aiClient,
      intentExtractor: createValidIntentExtractor('search'),
      experimentAssignments,
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Recommend a birdwatching tour.' },
    ], metadata);

    expect(experimentAssignments.resolve).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      experiment: 'tour_recommendation_prompt',
      defaultVariant: 'recommendation_prompt_v1',
    }));
    expect(metadata).toMatchObject({
      promptVersion: 'recommendation_prompt_v2',
      experiment: 'tour_recommendation_prompt',
      experimentVariant: 'recommendation_prompt_v2',
      promptVersions: {
        tourRecommendation: 'recommendation_prompt_v2',
      },
      experimentAssignments: {
        tourRecommendation: {
          experiment: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v2',
        },
      },
    });
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('guided-choice variant'),
        }),
      ]),
      expect.objectContaining({
        metadata: expect.objectContaining({
          promptVersion: 'recommendation_prompt_v2',
          experimentVariant: 'recommendation_prompt_v2',
        }),
      })
    );
  });

  it('selects the baseline prompt for the default experiment assignment', async () => {
    const metadata = {
      conversationId: 'conversation-default',
      userId: 'user-2',
      role: 'customer',
      authUser: { plan: 'FREE' },
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('I found matching tours.'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: {
        planner: {
          plan: jest.fn().mockResolvedValue({
            status: 'recommendations',
            steps: [{
              tool: 'searchTours',
              args: { recommend: true, limit: 3 },
            }],
          }),
        },
        executor: {
          executePlan: jest.fn().mockResolvedValue({
            success: true,
            steps: [{
              tool: 'searchTours',
              result: { success: true, tours: [{ tourId: 1 }] },
            }],
            errors: [],
          }),
        },
      },
      aiClient,
      intentExtractor: createValidIntentExtractor('search'),
      experimentAssignments: {
        resolve: jest.fn().mockResolvedValue({
          experiment: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v1',
        }),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    await orchestrator.generateResponseUntraced([
      { role: 'user', content: 'Recommend a tour.' },
    ], metadata);

    expect(metadata.promptVersion).toBe('recommendation_prompt_v1');
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('baseline variant'),
        }),
      ]),
      expect.objectContaining({
        metadata: expect.objectContaining({
          promptVersion: 'recommendation_prompt_v1',
          experimentVariant: 'recommendation_prompt_v1',
        }),
      })
    );
  });
});
