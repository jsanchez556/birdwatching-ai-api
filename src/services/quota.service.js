import quotaQueries from '../db/queries/quota.queries.js';
import HttpError from '../utils/httpError.js';

const QUOTA_FEATURES = {
  CHAT: 'chat',
  IDENTIFICATION: 'identification',
};

function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === '') {
    return null;
  }

  const normalized = Number(userId);

  return Number.isFinite(normalized) ? normalized : null;
}

function buildQuotaMessage(reservation) {
  return 'Daily quota exceeded';
}

class QuotaService {
  async reserveUsage({ userId, feature }) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return null;
    }

    const reservation = await quotaQueries.reserveDailyUsage({
      userId: normalizedUserId,
      feature,
    });

    if (!reservation?.allowed) {
      throw new HttpError(429, buildQuotaMessage(reservation || { feature }), {
        code: 'QUOTA_EXCEEDED',
        details: {
          plan: reservation?.plan,
          feature,
          used: reservation?.used,
          max: reservation?.max,
        },
      });
    }

    return reservation;
  }
}

export {
  QUOTA_FEATURES,
  QuotaService,
  buildQuotaMessage,
  normalizeUserId,
};
export default new QuotaService();
