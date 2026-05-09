import tourQueries from '../db/queries/tour.queries.js';

const budgetMaxPrice = {
  budget: 110,
  moderate: 155,
  luxury: null,
};

function invalidArguments(error) {
  return {
    success: false,
    code: 'INVALID_TOOL_ARGUMENTS',
    message: error.message,
  };
}

function toPositiveInteger(value, fieldName, fallback = null) {
  if (value === undefined || value === null) {
    if (fallback !== null) {
      return fallback;
    }
    throw new Error(`${fieldName} must be a positive integer`);
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numberValue;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeComparableText(value) {
  return normalizeText(value)?.toLowerCase() || '';
}

function tourNameMatchesSelection(tourName, selectedName) {
  const name = normalizeComparableText(tourName);
  const selection = normalizeComparableText(selectedName);

  if (!name || !selection) {
    return false;
  }

  if (name === selection || name.includes(selection) || selection.includes(name)) {
    return true;
  }

  const selectionTokens = selection
    .split(/\s+/)
    .filter((token) => token.length > 2);

  return selectionTokens.length > 0
    && selectionTokens.every((token) => name.includes(token));
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
  return {
    tourId: tour.id,
    name: tour.name,
    location: tour.location,
    pricePerPerson: tour.price,
    availableSlots: tour.availableSlots,
    durationHours: tour.durationHours,
    difficulty: tour.difficulty,
  };
}

function scoreTour(tour, {
  location,
  budget,
  difficulty,
  participants,
} = {}) {
  let score = 0;
  const reasons = [];
  const requestedLocation = normalizeText(location)?.toLowerCase();
  const requestedDifficulty = normalizeDifficulty(difficulty);
  const requestedBudget = normalizeBudget(budget);

  if (requestedLocation) {
    const locationMatches = tour.location.toLowerCase().includes(requestedLocation)
      || tour.name.toLowerCase().includes(requestedLocation);
    if (locationMatches) {
      score += 5;
      reasons.push(`Matches ${location}`);
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

  if (participants && tour.availableSlots >= participants) {
    score += 2;
    reasons.push(`Has ${tour.availableSlots} slots available`);
  }

  if (tour.availableSlots > 0) {
    score += 1;
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
  } = {}) {
    let minSlots;

    try {
      minSlots = toPositiveInteger(participants, 'participants', 1);
    } catch (error) {
      return invalidArguments(error);
    }

    const parsedMaxPrice = maxPrice === undefined || maxPrice === null ? null : Number(maxPrice);

    if (parsedMaxPrice !== null && (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0)) {
      return invalidArguments(new Error('maxPrice must be a positive number'));
    }

    const tours = await tourQueries.getAvailableTours({
      location: normalizeText(location),
      difficulty: normalizeDifficulty(difficulty),
      maxPrice: parsedMaxPrice,
      minSlots,
    });

    return {
      success: true,
      tours: tours.map(formatTour),
    };
  }

  async recommendTours({
    location,
    budget,
    difficulty,
    participants,
    limit = 3,
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
    const tours = await tourQueries.getAvailableTours({
      location: normalizeText(location),
      difficulty: normalizeDifficulty(difficulty),
      maxPrice: normalizedBudget ? budgetMaxPrice[normalizedBudget] : null,
      minSlots: participantCount,
    });

    const recommendedTours = tours
      .map((tour) => scoreTour(tour, {
        location,
        budget,
        difficulty,
        participants: participantCount,
      }))
      .sort((left, right) => right.recommendationScore - left.recommendationScore || left.pricePerPerson - right.pricePerPerson)
      .slice(0, resultLimit);

    return {
      success: true,
      tours: recommendedTours,
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
