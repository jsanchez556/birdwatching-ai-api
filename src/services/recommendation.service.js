import openaiClient from '../ai/openai.client.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';

class RecommendationService {
  async getRecommendations(location, budget, days, clientIP) {
    logger.info('Generating birdwatching recommendations', { 
      ip: clientIP, 
      location, 
      budget, 
      days 
    });

    if (!location || !budget || !days) {
      logger.warn('Missing required parameters', { ip: clientIP });
      throw new HttpError(400, 'Location, budget, and days are required', {
        code: 'VALIDATION_ERROR',
      });
    }

    const recommendations = await openaiClient.createStructuredRecommendation(
      location,
      budget,
      days
    );

    if (!recommendations) {
      logger.error('No recommendations from OpenAI', { ip: clientIP, location });
      throw new HttpError(502, 'Failed to generate recommendations', {
        code: 'AI_EMPTY_RESPONSE',
      });
    }

    logger.info('Recommendations generated successfully', { 
      ip: clientIP, 
      location,
      hasBirdSpecies: recommendations.recommendations?.birdSpecies?.length > 0,
      hasSpots: recommendations.recommendations?.bestSpots?.length > 0,
      hasItinerary: recommendations.recommendations?.suggestedItinerary?.length > 0
    });

    return recommendations;
  }
}

export default new RecommendationService();
