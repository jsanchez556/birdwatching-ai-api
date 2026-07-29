import quotaService, { QUOTA_FEATURES } from '../../services/quota.service.js';

function createUsageValidator(feature) {
  return async (req, res, next) => {
    try {
      const reservation = await quotaService.reserveUsage({
        userId: req.user?.id,
        feature,
      });
      req.usageQuota = reservation;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const validateChatQuota = createUsageValidator(QUOTA_FEATURES.CHAT);
const validateIdentificationQuota = createUsageValidator(QUOTA_FEATURES.IDENTIFICATION);

export {
  createUsageValidator,
  validateChatQuota,
  validateIdentificationQuota,
};
