import myToursService from '../../services/myTours.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class MyToursController {
  async list(req, res) {
    const result = await myToursService.list(req.user, req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async getById(req, res) {
    return sendSuccess(res, await myToursService.getById(req.user, req.params.id));
  }

  async create(req, res) {
    return sendSuccess(res, await myToursService.create(req.user, req.body), {}, 201);
  }

  async update(req, res) {
    return sendSuccess(res, await myToursService.update(req.user, req.params.id, req.body));
  }

  async references(req, res) {
    return sendSuccess(res, await myToursService.getReferences());
  }
}

export default new MyToursController();
