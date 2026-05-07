// Recommendation function schema for OpenAI function calling
export const recommendationSchema = {
  name: 'get_bird_recommendation',
  description: 'Get personalized birdwatching recommendations for Costa Rica based on user preferences',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The location in Costa Rica where the user wants to go birdwatching (e.g., Monteverde, Tortuguero, Osa Peninsula)'
      },
      budget: {
        type: 'string',
        enum: ['budget', 'moderate', 'luxury'],
        description: 'The budget level for the trip'
      },
      days: {
        type: 'integer',
        description: 'Number of days for the birdwatching trip'
      },
      recommendations: {
        type: 'object',
        properties: {
          birdSpecies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                scientificName: { type: 'string' },
                bestTimeToSee: { type: 'string' },
                habitat: { type: 'string' }
              }
            },
            description: 'List of bird species to look for in the area'
          },
          bestSpots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                region: { type: 'string' },
                highlights: { type: 'array', items: { type: 'string' } },
                bestSeason: { type: 'string' }
              }
            },
            description: 'Best birdwatching spots in the area'
          },
          suggestedItinerary: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'integer' },
                location: { type: 'string' },
                activities: { type: 'array', items: { type: 'string' } },
                targetBirds: { type: 'array', items: { type: 'string' } }
              }
            },
            description: 'Day-by-day itinerary suggestion'
          }
        },
        required: ['birdSpecies', 'bestSpots', 'suggestedItinerary']
      }
    },
    required: ['location', 'budget', 'days', 'recommendations']
  }
};