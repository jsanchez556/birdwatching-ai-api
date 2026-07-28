import featureAvailabilityService from '../../featureFlags/featureAvailability.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class FeatureAvailabilityController {
  async getAvailability(req, res) {
    return sendSuccess(res, await featureAvailabilityService.getAvailability());
  }
}

export default new FeatureAvailabilityController();
