import adminService from './admin.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class AdminController {
  async getOverview(req, res) {
    return sendSuccess(res, await adminService.getOverview(req.query));
  }

  async getUsers(req, res) {
    const result = await adminService.getUsers(req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async getSubscriptions(req, res) {
    const result = await adminService.getSubscriptions(req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async getAiUsage(req, res) {
    return sendSuccess(res, await adminService.getAiUsage(req.query));
  }

  async getAiCosts(req, res) {
    return sendSuccess(res, await adminService.getAiCosts(req.query));
  }

  async getReservations(req, res) {
    const result = await adminService.getReservations(req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async getQueueHealth(req, res) {
    return sendSuccess(res, await adminService.getQueueHealth());
  }

  async getFailures(req, res) {
    const result = await adminService.getFailures(req.query);
    return sendSuccess(res, result.data, result.meta);
  }
}

export { AdminController };
export default new AdminController();
