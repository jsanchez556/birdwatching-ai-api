import usageQueries from '../db/queries/usage.queries.js';
import logger from '../utils/logger.js';

function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === '') {
    return null;
  }

  const normalized = Number(userId);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeTokenCount(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? Math.trunc(normalized) : 0;
}

function normalizeCost(usage = {}) {
  if (!usage.hasEstimatedCost) {
    return null;
  }

  const normalized = Number(usage.estimatedCostUsd);
  return Number.isFinite(normalized) ? normalized : null;
}

class UsageService {
  async recordOpenAiUsage(userId, usage = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return null;
    }

    const promptTokens = normalizeTokenCount(usage.promptTokens);
    const completionTokens = normalizeTokenCount(usage.completionTokens);

    if (promptTokens === 0 && completionTokens === 0) {
      return null;
    }

    try {
      return await usageQueries.createLog({
        userId: normalizedUserId,
        promptTokens,
        completionTokens,
        estimatedCost: normalizeCost(usage),
      });
    } catch (error) {
      logger.warn('Failed to persist OpenAI usage log', {
        userId: normalizedUserId,
        error: error.message,
      });
      return null;
    }
  }
}

export {
  normalizeCost,
  normalizeTokenCount,
  normalizeUserId,
};
export default new UsageService();
