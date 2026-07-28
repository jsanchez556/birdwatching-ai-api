import { jest } from '@jest/globals';

const mockGetAvailableTours = jest.fn();
const mockRecommendTours = jest.fn();
const mockAnalyticsTrack = jest.fn();

await jest.unstable_mockModule('../src/services/tour.service.js', () => ({
  default: {
    getAvailableTours: mockGetAvailableTours,
    recommendTours: mockRecommendTours,
  },
}));

await jest.unstable_mockModule('../src/analytics/analytics.service.js', () => ({
  default: {
    track: mockAnalyticsTrack,
  },
}));

const { default: searchTours } = await import('../src/ai/tools/searchTours.tool.js');

describe('searchTours analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks successful structured tour recommendations', async () => {
    mockRecommendTours.mockResolvedValue({
      success: true,
      tours: [{ tourId: 1 }, { tourId: 2 }],
    });

    await expect(searchTours({
      recommend: true,
      limit: 2,
    }, {
      userId: 7,
      conversationId: 'conversation-123',
      model: 'gpt-test',
      source: 'voice',
      authUser: { plan: 'PRO' },
      ragTrace: { retrievedChunkCount: 3 },
      aiTraceId: '11111111-1111-4111-8111-111111111111',
    })).resolves.toMatchObject({
      success: true,
      tours: [{ tourId: 1 }, { tourId: 2 }],
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: 7,
      anonymousId: 'conversation:conversation-123',
      event: 'tour_recommended',
      idempotencyKey: 'conversation-123:1,2',
      properties: {
        conversationId: 'conversation-123',
        plan: 'PRO',
        recommendationCount: 2,
        recommendationType: 'recommendation',
        source: 'voice',
        aiTraceId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('does not track an empty recommendation result', async () => {
    mockRecommendTours.mockResolvedValue({
      success: true,
      tours: [],
    });

    await expect(searchTours({
      recommend: true,
    }, {
      userId: 7,
      conversationId: 'conversation-123',
    })).resolves.toEqual({
      success: true,
      tours: [],
    });

    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('attributes recommendation exposure to the assigned experiment variant', async () => {
    mockRecommendTours.mockResolvedValue({
      success: true,
      tours: [{ tourId: 1 }],
    });

    await searchTours({ recommend: true }, {
      userId: 7,
      conversationId: 'conversation-variant',
      experimentAssignments: {
        tourRecommendation: {
          experiment: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v2',
        },
      },
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(expect.objectContaining({
      event: 'tour_recommended',
      properties: expect.objectContaining({
        experiment: 'tour_recommendation_prompt',
        variant: 'recommendation_prompt_v2',
      }),
    }));
  });
});
