import homepageService from '../../services/homepage.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import HttpError from '../../utils/httpError.js';
import { normalizeTourType, TOUR_TYPES } from '../../constants/tourTypes.js';

function normalizeQueryValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

class HomepageController {
  handleGetHero(req, res) {
    const hero = homepageService.getHeroContent();
    return sendSuccess(res, { hero });
  }

  async handleGetTours(req, res) {
    const requestedType = normalizeQueryValue(req.query.type);
    const type = requestedType ? normalizeTourType(requestedType) : null;
    if (requestedType && !type) {
      throw new HttpError(422, `type must be one of: ${TOUR_TYPES.join(', ')}`, {
        code: 'validation_error',
      });
    }
    const tours = await homepageService.getFeaturedTours({ type });
    return sendSuccess(res, { tours, tourTypes: TOUR_TYPES });
  }

  async handleGetBirdHighlights(req, res) {
    const birds = await homepageService.getBirdHighlights();
    return sendSuccess(res, { birds });
  }

  async handleGetBirdProfile(req, res) {
    const speciesCode = normalizeQueryValue(req.query.speciesCode || req.query.species_code);
    const name = normalizeQueryValue(req.query.name);

    if (!speciesCode && !name) {
      throw new HttpError(422, 'Provide a bird species code or name.', {
        code: 'validation_error',
      });
    }

    const bird = await homepageService.getBirdProfile({ speciesCode, name });

    if (!bird) {
      throw new HttpError(404, 'Bird profile not found.', {
        code: 'bird_not_found',
      });
    }

    return sendSuccess(res, { bird });
  }

}

export default new HomepageController();
