import transportService from '../../services/transport.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class TransportController {
  async quoteRoute(req, res) {
    return sendSuccess(res, await transportService.createRouteQuote(req.body));
  }

  async listVehicles(req, res) {
    return sendSuccess(res, { vehicles: await transportService.listVehicles(req.body) });
  }

  async checkoutContext(req, res) {
    return sendSuccess(res, await transportService.getCheckoutContext(req.user.id));
  }

  async createBooking(req, res) {
    return sendSuccess(res, await transportService.createBooking(req.body, req.user), {}, 201);
  }
}

export default new TransportController();
