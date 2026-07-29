import adminService from './admin.service.js';
import adminOperationsService from './admin-operations.service.js';
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

  async getAiQuality(req, res) {
    return sendSuccess(res, await adminService.getAiQuality({
      startDate: req.query?.startDate,
      endDate: req.query?.endDate,
    }));
  }

  async getAiFeatures(req, res) {
    return sendSuccess(res, await adminOperationsService.getAiFeatureStates());
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

  async getErrors(req, res) {
    const result = await adminService.getErrors(req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async retryJob(req, res) {
    return sendSuccess(res, await adminOperationsService.retryFailedJob({
      adminUserId: Number(req.user.id),
      jobId: req.body.jobId,
    }));
  }

  async suspendUser(req, res) {
    return sendSuccess(res, await adminOperationsService.suspendUser({
      adminUserId: Number(req.user.id),
      userId: req.body.userId,
      reasonCode: req.body.reasonCode,
    }));
  }

  async disableAiFeature(req, res) {
    return sendSuccess(res, await adminOperationsService.disableAiFeature({
      adminUserId: Number(req.user.id),
      feature: req.body.feature,
      durationMinutes: req.body.durationMinutes,
    }));
  }

  async enableAiFeature(req, res) {
    return sendSuccess(res, await adminOperationsService.enableAiFeature({
      adminUserId: Number(req.user.id),
      feature: req.body.feature,
    }));
  }

  async unsuspendUser(req, res) {
    return sendSuccess(res, await adminOperationsService.unsuspendUser({
      adminUserId: Number(req.user.id),
      userId: req.body.userId,
    }));
  }
}

export { AdminController };
export default new AdminController();
