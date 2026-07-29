import tourService from '../../services/tour.service.js';
import analytics from '../../analytics/analytics.service.js';
import { ANALYTICS_EVENTS } from '../../analytics/events.js';
import { getTourRecommendationEventProperties } from '../../experiments/tourRecommendation.experiment.js';

function buildRecommendationIdempotencyKey(conversationId, tours = []) {
  if (!conversationId) {
    return undefined;
  }

  const tourIds = tours
    .map((tour) => tour?.tourId ?? tour?.id)
    .filter((tourId) => tourId !== undefined && tourId !== null)
    .map(String)
    .sort();

  if (tourIds.length === 0) {
    return undefined;
  }

  return `${conversationId}:${tourIds.join(',')}`;
}

async function searchTours(args = {}, metadata = {}) {
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

  if (result?.success !== false && Array.isArray(result?.tours) && result.tours.length > 0) {
    analytics.track({
      userId: metadata.userId,
      anonymousId: metadata.conversationId
        ? `conversation:${metadata.conversationId}`
        : undefined,
      event: ANALYTICS_EVENTS.TOUR_RECOMMENDED,
      idempotencyKey: buildRecommendationIdempotencyKey(
        metadata.conversationId,
        result.tours
      ),
      properties: {
        conversationId: metadata.conversationId,
        plan: metadata.authUser?.plan,
        recommendationCount: result.tours.length,
        recommendationType: args.recommend === true ? 'recommendation' : 'tour_search',
        source: metadata.source || 'chat',
        aiTraceId: metadata.aiTraceId,
        ...getTourRecommendationEventProperties(metadata),
      },
    });
  }

  return result;
}

export default searchTours;
