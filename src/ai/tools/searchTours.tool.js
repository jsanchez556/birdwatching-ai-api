import tourService from '../../services/tour.service.js';
import analytics from '../../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../../analytics/events.js';

async function searchTours(args = {}, metadata = {}) {
  const startedAt = Date.now();
  let result;

  if (args.recommend === true || args.budget || args.limit) {
    result = await tourService.recommendTours({
      location: args.location,
      query: args.query,
      budget: args.budget,
      difficulty: args.difficulty,
      participants: args.participants,
      limit: args.limit || 3,
    });
  } else {
    result = await tourService.getAvailableTours({
      location: args.location || args.query,
      difficulty: args.difficulty,
      maxPrice: args.maxPrice,
      participants: args.participants,
    });
  }

  if (result?.success !== false && Array.isArray(result?.tours)) {
    analytics.track({
      userId: metadata.userId,
      anonymousId: metadata.conversationId
        ? `conversation:${metadata.conversationId}`
        : undefined,
      event: ANALYTICS_EVENTS.TOUR_RECOMMENDED,
      properties: {
        conversationId: metadata.conversationId,
        latencyMs: Date.now() - startedAt,
        model: metadata.model,
        plan: metadata.authUser?.plan,
        recommendationCount: result.tours.length,
        recommendationType: args.recommend === true ? 'recommendation' : 'tour_search',
        source: metadata.source || 'chat',
      },
    });
  }

  return result;
}

export default searchTours;
