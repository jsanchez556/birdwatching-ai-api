import { DEFAULT_CURRENCY } from '../../constants/business.js';
import HttpError from '../../utils/httpError.js';
import { TourRecommendationSchema } from '../schemas/tourRecommendation.schema.js';

const LIMITED_AVAILABILITY_MAX_SLOTS = 3;

function availabilityStatus(availableSlots) {
  if (availableSlots === null || availableSlots === undefined || availableSlots === '') {
    return 'unknown';
  }

  const slots = Number(availableSlots);

  if (!Number.isInteger(slots) || slots < 0) return 'unknown';
  if (slots === 0) return 'unavailable';
  if (slots <= LIMITED_AVAILABILITY_MAX_SLOTS) return 'limited';
  return 'available';
}

function estimatedPrice(tour) {
  if (tour.pricePerPerson === null || tour.pricePerPerson === undefined) {
    return { amount: null, currency: null };
  }

  return {
    amount: Number(tour.pricePerPerson),
    currency: tour.currency || DEFAULT_CURRENCY,
  };
}

function matchReasons(tour) {
  const reasons = Array.isArray(tour.reasons)
    ? tour.reasons.filter((reason) => typeof reason === 'string' && reason.trim().length >= 3)
    : [];

  if (reasons.length > 0) return reasons;
  if (typeof tour.location === 'string' && tour.location.trim()) {
    return [`Birdwatching experience in ${tour.location.trim()}`];
  }
  return [];
}

function confidence(tour) {
  const score = Number(tour.recommendationScore);
  if (!Number.isFinite(score) || score < 0) return Number.NaN;
  return Number((score / (score + 5)).toFixed(4));
}

/**
 * @param {{
 *   summary: string,
 *   tours: object[],
 *   followUpQuestion?: string|null,
 *   sources?: {title: string, url: string|null}[],
 *   assumptions?: string[]
 * }} input
 * @returns {import('../schemas/tourRecommendation.schema.js').TourRecommendation}
 */
function buildTourRecommendation({
  summary,
  tours,
  followUpQuestion = null,
  sources = [],
  assumptions = [],
}) {
  const candidate = {
    summary,
    recommendations: tours.map((tour) => ({
      tourId: (
        (typeof tour.tourId === 'string' && tour.tourId.trim())
        || (typeof tour.tourId === 'number' && Number.isFinite(tour.tourId))
      )
        ? String(tour.tourId)
        : undefined,
      tourName: tour.name,
      location: tour.location,
      estimatedPrice: estimatedPrice(tour),
      matchReasons: matchReasons(tour),
      availabilityStatus: availabilityStatus(tour.availableSlots),
      confidence: confidence(tour),
    })),
    sources,
    assumptions,
    followUpQuestion,
  };
  const result = TourRecommendationSchema.safeParse(candidate);

  if (!result.success) {
    throw new HttpError(502, 'Unable to validate tour recommendations', {
      code: 'PROVIDER_MALFORMED_RESPONSE',
    });
  }

  return result.data;
}

export {
  LIMITED_AVAILABILITY_MAX_SLOTS,
  availabilityStatus,
  buildTourRecommendation,
  confidence,
  estimatedPrice,
  matchReasons,
};
