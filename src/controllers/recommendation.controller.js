import recommendationService from '../services/recommendation.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

class RecommendationController {
  async handleRecommendation(req, res) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const { location, budget, days } = req.body;
    logger.info('Recommendation request received', { ip: clientIP, location, budget, days });

    const result = await recommendationService.getRecommendations(
      location,
      budget,
      days,
      clientIP
    );

    return sendSuccess(res, result.recommendations, result.meta);
  }
}

export default new RecommendationController();
