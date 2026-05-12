export function formatRecommendationUserPrompt({ location, budget, days }) {
  return `Generate birdwatching recommendations for:
- Location: ${location}
- Budget: ${budget}
- Days: ${days}`;
}
