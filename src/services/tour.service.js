import tourQueries from '../db/queries/tour.queries.js';
import { normalizeComparableText, normalizeText } from '../utils/normalizer.utils.js';
import { invalidArguments, toPositiveInteger } from '../utils/toolResponses.js';
import { normalizeTourType } from '../constants/tourTypes.js';
import { normalizeTourDuration } from '../utils/tourDuration.utils.js';

const budgetMaxPrice = {
  budget: 110,
  moderate: 155,
  luxury: null,
};

function singularizeToken(token) {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

function queryTokens(value) {
  return normalizeComparableText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(singularizeToken)
    .filter((token) => token.length > 2 && ![
      'where',
      'what',
      'when',
      'which',
      'tour',
      'tours',
      'see',
      'can',
      'for',
      'the',
      'and',
      'with',
      'from',
      'transport',
      'transportation',
      'transfer',
      'shuttle',
      'pickup',
      'san',
      'jose',
      'josé',
      'birdwatching',
      'bird',
      'watching',
    ].includes(token));
}

function tourNameMatchesSelection(tourName, selectedName) {
  const name = normalizeComparableText(tourName);
  const selection = normalizeComparableText(selectedName);

  if (!name || !selection) {
    return false;
  }

  return name === selection;
}

function normalizeBudget(value) {
  const budget = normalizeText(value)?.toLowerCase();
  return budget && Object.prototype.hasOwnProperty.call(budgetMaxPrice, budget)
    ? budget
    : null;
}

function normalizeDifficulty(value) {
  const difficulty = normalizeText(value)?.toLowerCase();
  return ['easy', 'moderate', 'challenging'].includes(difficulty) ? difficulty : null;
}

function formatTour(tour) {
  const isScheduled = tour.tourType === 'scheduled';
  const duration = normalizeTourDuration(tour);
  const formattedTour = {
    tourId: tour.id,
    name: tour.name,
    location: tour.location,
    pricePerPerson: tour.price,
    availableSlots: isScheduled ? tour.availableSlots : null,
    durationValue: duration.durationValue,
    durationUnit: duration.durationUnit,
    durationHours: duration.durationHours,
    duration: duration.duration,
    difficulty: tour.difficulty,
    type: tour.type || 'Birdwatching',
    imagePath: tour.imagePath ?? null,
    imageVersion: tour.imageVersion ?? null,
  };

  [
    ['country', tour.country],
    ['description', tour.description],
    ['node', tour.node],
    ['subnode', tour.subnode],
    ['zone', tour.zone],
    ['rank', tour.rank],
    ['zoneRank', tour.zoneRank],
    ['lat', tour.lat],
    ['lon', tour.lon],
    ['start_date', tour.startDate],
    ['end_date', tour.endDate],
    ['birds', tour.birds],
  ].forEach(([key, value]) => {
    if (value !== undefined) {
      formattedTour[key] = value;
    }
  });
  [
    ['tourType', tour.tourType],
    ['isActive', tour.isActive],
    ['maxParticipants', tour.maxParticipants],
    ['minimumPrice', tour.minimumPrice],
    ['occurrenceDates', tour.occurrenceDates],
  ].forEach(([key, value]) => {
    if (value !== undefined) formattedTour[key] = value;
  });

  return formattedTour;
}

function scoreTour(tour, {
  location,
  query,
  budget,
  difficulty,
  participants,
  requestedDate,
  itineraryStartDate,
  itineraryEndDate,
} = {}) {
  let score = 0;
  const reasons = [];
  const requestedLocation = normalizeComparableText(location);
  const requestedDifficulty = normalizeDifficulty(difficulty);
  const requestedBudget = normalizeBudget(budget);
  const requestedQueryTokens = queryTokens(query);
  const tourLocation = normalizeComparableText(tour.location);
  const tourName = normalizeComparableText(tour.name);
  const tourText = normalizeComparableText([
    tour.name,
    tour.location,
    tour.difficulty,
  ].filter(Boolean).join(' '));

  if (requestedLocation) {
    const locationMatches = tourLocation.includes(requestedLocation)
      || tourName.includes(requestedLocation);
    if (locationMatches) {
      score += 5;
      reasons.push(`Matches ${location}`);
    }
  }

  if (requestedQueryTokens.length > 0) {
    const matchedTokens = requestedQueryTokens.filter((token) => tourText.includes(token));

    if (matchedTokens.length > 0) {
      score += matchedTokens.length * 6;
      reasons.push(`Matches ${matchedTokens.join(', ')}`);
    }
  }

  if (requestedDifficulty && tour.difficulty.toLowerCase() === requestedDifficulty) {
    score += 3;
    reasons.push(`${tour.difficulty} difficulty`);
  }

  if (requestedBudget) {
    const maxPrice = budgetMaxPrice[requestedBudget];
    if (maxPrice === null || tour.price <= maxPrice) {
      score += 2;
      reasons.push(`Fits ${requestedBudget} budget`);
    }
  }

  const capacity = tour.tourType === 'scheduled'
    ? tour.availableSlots
    : (tour.maxParticipants ?? tour.availableSlots);
  if (participants && capacity >= participants) {
    score += 2;
    reasons.push(tour.tourType === 'scheduled'
      ? `Has ${tour.availableSlots} slots available`
      : `Supports up to ${tour.maxParticipants} participants`);
  }

  if (capacity > 0) {
    score += 1;
  }

  const validDates = (tour.occurrenceDates || []).filter((occurrence) => {
    if (!occurrence.date || occurrence.status !== 'scheduled' || occurrence.remainingSpaces < (participants || 1)) return false;
    if (itineraryStartDate && occurrence.date < itineraryStartDate) return false;
    if (itineraryEndDate && occurrence.date > itineraryEndDate) return false;
    return true;
  });
  if (requestedDate && (tour.tourType === 'unscheduled' || validDates.some((item) => item.date === requestedDate))) {
    score += 7;
    reasons.push(`Available on ${requestedDate}`);
  } else if (!requestedDate && validDates.length > 0) {
    score += 2;
    reasons.push('Has dates within the itinerary');
  }

  return {
    ...formatTour(tour),
    recommendationScore: score,
    reasons,
  };
}

class TourService {
  async getAvailableTours({
    location,
    difficulty,
    maxPrice,
    participants,
    type,
  } = {}) {
    let minSlots;

    try {
      minSlots = toPositiveInteger(participants, 'participants', 1);
    } catch (error) {
      return invalidArguments(error);
    }

    const parsedMaxPrice = maxPrice === undefined || maxPrice === null ? null : Number(maxPrice);
    const normalizedType = type === undefined || type === null || type === ''
      ? null
      : normalizeTourType(type);

    if (parsedMaxPrice !== null && (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0)) {
      return invalidArguments(new Error('maxPrice must be a positive number'));
    }
    if (type && !normalizedType) return invalidArguments(new Error('type is not supported'));

    const tours = await tourQueries.getAvailableTours({
      location: normalizeText(location),
      difficulty: normalizeDifficulty(difficulty),
      maxPrice: parsedMaxPrice,
      minSlots,
      type: normalizedType,
    });

    return {
      success: true,
      tours: tours.map(formatTour),
    };
  }

  async recommendTours({
    location,
    query,
    budget,
    difficulty,
    participants,
    date,
    itineraryStartDate,
    itineraryEndDate,
    limit = 3,
    type,
  } = {}) {
    let participantCount;
    let resultLimit;

    try {
      participantCount = toPositiveInteger(participants, 'participants', 1);
      resultLimit = Math.min(toPositiveInteger(limit, 'limit', 3), 5);
    } catch (error) {
      return invalidArguments(error);
    }

    const normalizedBudget = normalizeBudget(budget);
    const strongTours = await tourQueries.getAvailableTours({
      location: normalizeText(location),
      difficulty: normalizeDifficulty(difficulty),
      maxPrice: normalizedBudget ? budgetMaxPrice[normalizedBudget] : null,
      minSlots: participantCount,
      type: type ? normalizeTourType(type) : null,
    });
    let tours = Array.isArray(strongTours) ? strongTours : [];
    const strongTourIds = new Set(tours.map((tour) => String(tour.id)));
    if (tours.length < resultLimit) {
      const alternatives = await tourQueries.getAvailableTours({
        minSlots: participantCount,
        type: type ? normalizeTourType(type) : null,
      });
      const byId = new Map(tours.map((tour) => [String(tour.id), tour]));
      for (const tour of alternatives || []) byId.set(String(tour.id), tour);
      tours = [...byId.values()];
    }

    const eligibleTours = tours
      .filter((tour) => tour.isActive !== false)
      .filter((tour) => tour.tourType === 'scheduled'
        || (tour.maxParticipants ?? tour.availableSlots) >= participantCount)
      .filter((tour) => tour.tourType !== 'scheduled' || (tour.occurrenceDates || [])
        .some((occurrence) => occurrence.status === 'scheduled'
          && occurrence.remainingSpaces >= participantCount
          && (!date || occurrence.date === date)
          && (!itineraryStartDate || occurrence.date >= itineraryStartDate)
          && (!itineraryEndDate || occurrence.date <= itineraryEndDate)));

    const recommendedTours = eligibleTours
      .map((tour) => scoreTour(tour, {
        location,
        query,
        budget,
        difficulty,
        participants: participantCount,
        requestedDate: date,
        itineraryStartDate,
        itineraryEndDate,
      }))
      .map((tour) => {
        const strong = strongTourIds.has(String(tour.tourId));
        return {
          ...tour,
          matchStrength: strong ? 'strong' : 'alternative',
          reasons: strong ? tour.reasons : [...tour.reasons, 'Alternative eligible option'],
        };
      })
      .sort((left, right) => right.recommendationScore - left.recommendationScore
        || left.pricePerPerson - right.pricePerPerson || left.tourId - right.tourId)
      .slice(0, resultLimit);

    return {
      success: true,
      tours: recommendedTours,
      requestedCount: resultLimit,
      eligibleCount: eligibleTours.length,
      fewerThanRequestedReason: recommendedTours.length < resultLimit
        ? `Only ${recommendedTours.length} eligible tour${recommendedTours.length === 1 ? '' : 's'} can accommodate the request.`
        : null,
    };
  }

  async selectTour({ tourId, tourName, participants } = {}) {
    let normalizedTourId;
    let participantCount;

    try {
      if (tourId !== undefined && tourId !== null) {
        normalizedTourId = toPositiveInteger(tourId, 'tourId');
      }
      participantCount = toPositiveInteger(participants, 'participants', 1);
    } catch (error) {
      return invalidArguments(error);
    }

    if (!normalizedTourId) {
      const normalizedTourName = normalizeComparableText(tourName);

      if (!normalizedTourName) {
        return invalidArguments(new Error('tourId or tourName is required'));
      }

      const tours = await tourQueries.getAvailableTours({ minSlots: participantCount });
      const matchingTours = tours.filter((tour) => {
        return tourNameMatchesSelection(tour.name, normalizedTourName);
      });

      if (matchingTours.length === 0) {
        return {
          success: false,
          code: 'TOUR_NOT_FOUND',
          message: `I couldn't find ${tourName}. Would you like me to show available options?`,
        };
      }

      if (matchingTours.length > 1) {
        return {
          success: false,
          code: 'TOUR_SELECTION_AMBIGUOUS',
          message: `I found more than one tour matching ${tourName}. Please choose a tour ID.`,
          tours: matchingTours.map(formatTour),
        };
      }

      normalizedTourId = matchingTours[0].id;
    }

    const result = await tourQueries.selectTour({
      tourId: normalizedTourId,
      participants: participantCount,
    });

    if (!result?.success) {
      return result || {
        success: false,
        code: 'TOUR_NOT_FOUND',
        message: `Tour ${tourId} was not found.`,
      };
    }

    return {
      success: true,
      selectedTour: formatTour(result.tour),
      message: result.message,
      nextStep: 'Ask for participant count and customer name before creating the reservation.',
    };
  }
}

export {
  budgetMaxPrice,
  formatTour,
  scoreTour,
  tourNameMatchesSelection,
  toPositiveInteger,
};

export default new TourService();
