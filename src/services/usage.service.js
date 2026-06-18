import usageQueries from '../db/queries/usage.queries.js';
import logger from '../utils/logger.js';

const USAGE_FEATURES = {
  CHAT: 'chat',
  IDENTIFICATION: 'identification',
  EMBEDDING: 'embedding',
  VOICE: 'voice',
  IMAGE_ANALYSIS: 'image_analysis',
};

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

function normalizeTraceId(traceId) {
  return typeof traceId === 'string' && traceId.trim() ? traceId.trim() : null;
}

function normalizeModelUsage(modelUsage = []) {
  if (!Array.isArray(modelUsage)) {
    return [];
  }

  return modelUsage
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      model: typeof entry.model === 'string' && entry.model.trim() ? entry.model.trim() : 'unknown',
      promptTokens: normalizeTokenCount(entry.promptTokens),
      completionTokens: normalizeTokenCount(entry.completionTokens),
      totalTokens: normalizeTokenCount(entry.totalTokens),
      estimatedCostUsd: Number.isFinite(Number(entry.estimatedCostUsd))
        ? Number(entry.estimatedCostUsd)
        : null,
    }))
    .filter((entry) => entry.totalTokens > 0 || entry.promptTokens > 0 || entry.completionTokens > 0);
}

function buildModelUsageEntry(model, {
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = null,
  estimatedCostUsd = null,
} = {}) {
  const normalizedPromptTokens = normalizeTokenCount(promptTokens);
  const normalizedCompletionTokens = normalizeTokenCount(completionTokens);
  const normalizedTotalTokens = normalizeTokenCount(
    totalTokens ?? normalizedPromptTokens + normalizedCompletionTokens
  );

  return {
    model: typeof model === 'string' && model.trim() ? model.trim() : 'unknown',
    promptTokens: normalizedPromptTokens,
    completionTokens: normalizedCompletionTokens,
    totalTokens: normalizedTotalTokens,
    estimatedCostUsd: Number.isFinite(Number(estimatedCostUsd)) ? Number(estimatedCostUsd) : null,
  };
}

function buildBillingTraceMetadata({
  usageEvent,
  feature,
  tokens,
  estimatedCost,
  modelUsage = [],
}) {
  if (!usageEvent) {
    return null;
  }

  const normalizedCost = Number(estimatedCost ?? usageEvent.estimated_cost);

  return {
    billingUsageEventId: usageEvent.id,
    billingFeature: usageEvent.feature || feature,
    requestCostUsd: Number.isFinite(normalizedCost) ? Number(normalizedCost.toFixed(6)) : null,
    requestTokens: normalizeTokenCount(tokens ?? usageEvent.tokens),
    modelUsage: normalizeModelUsage(modelUsage.length ? modelUsage : usageEvent.model_usage),
  };
}

class UsageService {
  async recordUsageEvent({
    userId,
    feature,
    tokens = 0,
    estimatedCost = null,
    traceId = null,
    modelUsage = [],
  }) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return null;
    }

    const normalizedTokens = normalizeTokenCount(tokens);
    const normalizedCost = Number(estimatedCost);

    if (normalizedTokens === 0 && (!Number.isFinite(normalizedCost) || normalizedCost <= 0)) {
      return null;
    }

    try {
      return await usageQueries.createUsageEvent({
        userId: normalizedUserId,
        feature,
        tokens: normalizedTokens,
        estimatedCost: Number.isFinite(normalizedCost) ? normalizedCost : null,
        traceId: normalizeTraceId(traceId),
        modelUsage: normalizeModelUsage(modelUsage),
      });
    } catch (error) {
      logger.warn('Failed to persist usage event', {
        userId: normalizedUserId,
        feature,
        error: error.message,
      });
      return null;
    }
  }

  async updateReservedUsageEvent({
    usageEventId,
    userId,
    tokens = 0,
    estimatedCost = null,
    traceId = null,
    modelUsage = [],
  }) {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedUsageEventId = Number(usageEventId);

    if (normalizedUserId === null || !Number.isFinite(normalizedUsageEventId)) {
      return null;
    }

    try {
      return await usageQueries.updateUsageEventCost({
        usageEventId: normalizedUsageEventId,
        userId: normalizedUserId,
        tokens: normalizeTokenCount(tokens),
        estimatedCost,
        traceId: normalizeTraceId(traceId),
        modelUsage: normalizeModelUsage(modelUsage),
      });
    } catch (error) {
      logger.warn('Failed to update reserved usage event cost', {
        userId: normalizedUserId,
        usageEventId: normalizedUsageEventId,
        error: error.message,
      });
      return null;
    }
  }

  async recordOpenAiUsage(userId, usage = {}, { usageEventId, traceId } = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return null;
    }

    const promptTokens = normalizeTokenCount(usage.promptTokens);
    const completionTokens = normalizeTokenCount(usage.completionTokens);

    if (promptTokens === 0 && completionTokens === 0) {
      return null;
    }

    const modelUsage = normalizeModelUsage(usage.modelUsage);
    const totalTokens = usage.totalTokens || promptTokens + completionTokens;
    const estimatedCost = normalizeCost(usage);
    const usageEvent = await this.updateReservedUsageEvent({
      usageEventId,
      userId: normalizedUserId,
      tokens: totalTokens,
      estimatedCost,
      traceId,
      modelUsage,
    });

    try {
      const usageLog = await usageQueries.createLog({
        userId: normalizedUserId,
        promptTokens,
        completionTokens,
        estimatedCost,
      });

      return {
        usageEvent,
        usageLog,
        traceMetadata: buildBillingTraceMetadata({
          usageEvent,
          feature: USAGE_FEATURES.CHAT,
          tokens: totalTokens,
          estimatedCost,
          modelUsage,
        }),
      };
    } catch (error) {
      logger.warn('Failed to persist OpenAI usage log', {
        userId: normalizedUserId,
        error: error.message,
      });
      return {
        usageEvent,
        usageLog: null,
        traceMetadata: buildBillingTraceMetadata({
          usageEvent,
          feature: USAGE_FEATURES.CHAT,
          tokens: totalTokens,
          estimatedCost,
          modelUsage,
        }),
      };
    }
  }

  async getMonthlyDashboard(userId, { monthStart = null } = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return {
        monthlyCost: 0,
        monthlyRequests: 0,
      };
    }

    const row = await usageQueries.getMonthlyDashboard({
      userId: normalizedUserId,
      monthStart,
    });

    return {
      monthlyCost: Number(Number(row?.monthly_cost || 0).toFixed(2)),
      monthlyRequests: Number(row?.monthly_requests || 0),
    };
  }
}

export {
  USAGE_FEATURES,
  buildBillingTraceMetadata,
  buildModelUsageEntry,
  normalizeCost,
  normalizeModelUsage,
  normalizeTokenCount,
  normalizeTraceId,
  normalizeUserId,
};
export default new UsageService();
