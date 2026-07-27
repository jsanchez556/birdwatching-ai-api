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
        latencyMs: expect.any(Number),
        model: 'gpt-test',
        plan: 'PRO',
        ragUsed: true,
        recommendationCount: 2,
        recommendationType: 'recommendation',
        source: 'voice',
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
});
