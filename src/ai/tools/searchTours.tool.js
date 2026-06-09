import tourService from '../../services/tour.service.js';

async function searchTours(args = {}) {
  if (args.recommend === true || args.budget || args.limit) {
    return tourService.recommendTours({
      location: args.location,
      query: args.query,
      budget: args.budget,
      difficulty: args.difficulty,
      participants: args.participants,
      limit: args.limit || 3,
    });
  }

  return tourService.getAvailableTours({
    location: args.location || args.query,
    difficulty: args.difficulty,
    maxPrice: args.maxPrice,
    participants: args.participants,
  });
}

export default searchTours;
