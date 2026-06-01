import homepageService from '../services/homepage.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class HomepageController {
  handleGetHero(req, res) {
    const hero = homepageService.getHeroContent();
    return sendSuccess(res, { hero });
  }

  async handleGetTours(req, res) {
    const tours = await homepageService.getFeaturedTours();
    return sendSuccess(res, { tours });
  }

  async handleGetBirdHighlights(req, res) {
    const birds = homepageService.getBirdHighlights();
    return sendSuccess(res, { birds });
  }

  async handleGetTransportation(req, res) {
    const transportation = homepageService.getTransportationAddOns();
    return sendSuccess(res, { transportation });
  }
}

export default new HomepageController();
