import adminService from '../../services/admin/admin.service.js';
import adminOperationsService from '../../services/admin/adminOperations.service.js';
import modelRoutingService from '../../services/admin/modelRouting.service.js';
import adminMaintenanceService from '../../services/admin/adminMaintenance.service.js';
import locationSearchService from '../../services/admin/locationSearch.service.js';
import tourImageService from '../../services/admin/tourImage.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class AdminController {
  async searchLocations(req, res) {
    if (req.query.latitude !== undefined || req.query.longitude !== undefined) {
      const result = await locationSearchService.reverse(req.query);
      return sendSuccess(res, { items: result ? [result] : [] });
    }
    return sendSuccess(res, {
      items: await locationSearchService.search(req.query),
    });
  }

  async listMaintenance(req, res) {
    const result = await adminMaintenanceService.list(req.params.resource, req.query);
    return sendSuccess(res, result.data, result.meta);
  }

  async getMaintenance(req, res) {
    return sendSuccess(res, await adminMaintenanceService.getById(req.params.resource, req.params.id));
  }

  async createMaintenance(req, res) {
    const result = await adminMaintenanceService.create(req.params.resource, req.body, {
      authUser: req.user,
    });
    return sendSuccess(res, result, {}, 201);
  }

  async updateMaintenance(req, res) {
    return sendSuccess(res, await adminMaintenanceService.update(
      req.params.resource, req.params.id, req.body
    ));
  }

  async deleteMaintenance(req, res) {
    return sendSuccess(res, await adminMaintenanceService.remove(req.params.resource, req.params.id));
  }

  async replaceTourImage(req, res) {
    return sendSuccess(res, await tourImageService.replace({
      tourId: req.params.tourId,
      imageUpload: req.imageUpload,
    }));
  }

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

  async getContextEngineering(req, res) {
    return sendSuccess(res, await adminService.getContextEngineering({
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

  async previewModelRouting(req, res) {
    return sendSuccess(res, modelRoutingService.preview(req.body));
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

  async changeUserRole(req, res) {
    return sendSuccess(res, await adminOperationsService.changeUserRole({
      adminUserId: Number(req.user.id),
      userId: req.body.userId,
      role: req.body.role,
    }));
  }
}

export { AdminController };
export default new AdminController();
