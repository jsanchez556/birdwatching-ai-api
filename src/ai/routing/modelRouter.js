import HttpError from '../../utils/httpError.js';
import { MODEL_POLICIES, TASK_CATEGORY_SET } from './modelPolicies.js';
import { MODEL_REGISTRY, validateRegistryEntry } from './modelRegistry.js';

const TIER_RANK = Object.freeze({ economy: 0, balanced: 1, advanced: 2 });
const CLASS_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });
const COMPLEXITIES = new Set(['low', 'medium', 'high']);
const MAX_ESTIMATED_INPUT_TOKENS = 1_000_000;

function routingError(status, message, code, details) {
  return new HttpError(status, message, { code, details });
}

function validateRouteInput({
  task,
  estimatedInputTokens = 0,
  complexity = 'medium',
} = {}) {
  if (!TASK_CATEGORY_SET.has(task)) {
    throw routingError(
      422,
      'Unsupported model-routing task category.',
      'MODEL_ROUTING_UNSUPPORTED_TASK',
      { task: typeof task === 'string' ? task : null }
    );
  }
  if (!Number.isSafeInteger(estimatedInputTokens)
    || estimatedInputTokens < 0
    || estimatedInputTokens > MAX_ESTIMATED_INPUT_TOKENS) {
    throw routingError(
      422,
      `estimatedInputTokens must be an integer from 0 to ${MAX_ESTIMATED_INPUT_TOKENS}.`,
      'MODEL_ROUTING_INVALID_INPUT',
      { field: 'estimatedInputTokens' }
    );
  }
  if (!COMPLEXITIES.has(complexity)) {
    throw routingError(
      422,
      'complexity must be low, medium, or high.',
      'MODEL_ROUTING_INVALID_INPUT',
      { field: 'complexity' }
    );
  }
}

function resolvePolicy(task, basePolicy, {
  estimatedInputTokens,
  userPlan,
  complexity,
}) {
  if (complexity === 'high'
    && ['intent_classification', 'general_chat', 'rag_answer', 'tour_recommendation'].includes(task)) {
    return {
      ...basePolicy,
      tier: 'advanced',
      reasoningEffort: 'medium',
      reasonCode: 'HIGH_COMPLEXITY_REQUEST',
      reason: 'High-complexity request requiring stronger reasoning',
    };
  }

  if (estimatedInputTokens >= 16000
    && ['general_chat', 'rag_answer', 'tour_recommendation'].includes(task)) {
    return {
      ...basePolicy,
      tier: 'advanced',
      reasoningEffort: 'medium',
      reasonCode: 'LONG_CONTEXT_INPUT',
      reason: 'Large input requiring advanced context handling',
    };
  }

  if (task === 'general_chat' && complexity === 'low' && userPlan === 'FREE') {
    return {
      ...basePolicy,
      tier: 'economy',
      reasoningEffort: 'low',
      latencyPriority: 'high',
      reasonCode: 'ECONOMY_SIMPLE_CHAT',
      reason: 'Simple chat optimized for cost and latency',
    };
  }

  return basePolicy;
}

function supportsPolicy(model, policy, estimatedInputTokens) {
  const capabilities = model.capabilities;

  return model.service === 'generation'
    && (!policy.requiresVision || capabilities.modalities.includes('image'))
    && (!policy.requiresStructuredOutput || capabilities.structuredOutput === true)
    && (!policy.requiresToolCalling || capabilities.toolCalling === true)
    && (!policy.requiresEvaluationModel || capabilities.evaluationAllowed === true)
    && capabilities.reasoningEfforts.includes(policy.reasoningEffort)
    && CLASS_RANK[capabilities.structuralReliability] >= CLASS_RANK[policy.structuralReliability]
    && (!model.maxInputTokens || estimatedInputTokens <= model.maxInputTokens);
}

function modelScore(model, policy) {
  const targetTier = TIER_RANK[policy.tier];
  const modelTier = TIER_RANK[model.tier];
  const tierDistance = Math.abs(modelTier - targetTier);
  const underTierPenalty = modelTier < targetTier ? 50 : 0;
  const latencyScore = policy.latencyPriority === 'high' ? CLASS_RANK[model.latencyClass] * 4 : 0;
  const costScore = CLASS_RANK[model.costClass] * (policy.tier === 'economy' ? 4 : 1);
  const evaluationScore = policy.requiresEvaluationModel
    ? (2 - CLASS_RANK[model.capabilities.evaluationSuitability]) * 10
    : 0;
  const structuralScore = policy.requiresStructuredOutput
    ? (2 - CLASS_RANK[model.capabilities.structuralReliability]) * 5
    : 0;
  const strengthScore = policy.preferredStrength
    && !model.capabilities.strengths?.includes(policy.preferredStrength)
    ? 15
    : 0;

  return (tierDistance * 20)
    + underTierPenalty
    + latencyScore
    + costScore
    + evaluationScore
    + structuralScore
    + strengthScore;
}

function fallbackTierOrder(primaryTier) {
  if (primaryTier === 'advanced') return ['balanced', 'economy', 'advanced'];
  if (primaryTier === 'economy') return ['economy', 'balanced', 'advanced'];
  return ['balanced', 'economy', 'advanced'];
}

function fallbackScore(model, primary) {
  const tierOrder = fallbackTierOrder(primary.tier);
  return (tierOrder.indexOf(model.tier) * 100)
    + (CLASS_RANK[model.costClass] * 10)
    + CLASS_RANK[model.latencyClass];
}

function toPublicModel(model) {
  return {
    key: model.key,
    modelId: model.modelId,
  };
}

function createModelRouter({
  registry = MODEL_REGISTRY,
  policies = MODEL_POLICIES,
} = {}) {
  return function routeModel(input = {}) {
    const {
      task,
      estimatedInputTokens = 0,
      userPlan = 'FREE',
      complexity = 'medium',
      evaluatedModelKey,
    } = input;

    validateRouteInput({ task, estimatedInputTokens, complexity });
    const basePolicy = policies?.[task];

    if (!basePolicy) {
      throw routingError(500, 'Model policy is not configured.', 'MODEL_POLICY_MISCONFIGURED', {
        task,
      });
    }

    const policy = resolvePolicy(task, basePolicy, {
      estimatedInputTokens,
      userPlan,
      complexity,
    });
    const entries = Object.entries(registry || {});

    if (entries.length === 0) {
      throw routingError(503, 'No models are configured.', 'MODEL_ROUTE_UNAVAILABLE', { task });
    }

    for (const [key, entry] of entries) {
      validateRegistryEntry(entry, key);
    }

    const evaluatedModel = evaluatedModelKey ? registry[evaluatedModelKey] : null;

    if (evaluatedModelKey && !evaluatedModel) {
      throw routingError(
        422,
        'evaluatedModelKey does not identify a configured model.',
        'MODEL_ROUTING_INVALID_INPUT',
        { field: 'evaluatedModelKey' }
      );
    }

    const candidates = entries
      .map(([, entry]) => entry)
      .filter((entry) => supportsPolicy(entry, policy, estimatedInputTokens))
      .filter((entry) => task !== 'evaluation'
        || !evaluatedModel
        || (entry.key !== evaluatedModel.key && entry.modelId !== evaluatedModel.modelId))
      .sort((left, right) => modelScore(left, policy) - modelScore(right, policy)
        || left.key.localeCompare(right.key));

    if (candidates.length === 0) {
      const code = task === 'bird_image_analysis'
        ? 'VISION_MODEL_UNAVAILABLE'
        : (task === 'evaluation' && evaluatedModel
          ? 'EVALUATION_MODEL_CONFLICT'
          : 'MODEL_ROUTE_UNAVAILABLE');
      throw routingError(503, 'No eligible model is configured for this routing policy.', code, {
        task,
      });
    }

    const primary = candidates[0];
    const seenModelIds = new Set([primary.modelId]);
    const fallbacks = candidates
      .slice(1)
      .sort((left, right) => fallbackScore(left, primary) - fallbackScore(right, primary)
        || left.key.localeCompare(right.key))
      .filter((entry) => {
        if (seenModelIds.has(entry.modelId)) return false;
        seenModelIds.add(entry.modelId);
        return true;
      });

    if (fallbacks.length === 0) {
      const code = task === 'evaluation' && evaluatedModel
        ? 'EVALUATION_MODEL_CONFLICT'
        : 'MODEL_FALLBACK_UNAVAILABLE';
      throw routingError(503, 'No compatible fallback model is configured.', code, { task });
    }

    return Object.freeze({
      task,
      route: policy.tier,
      primaryModel: Object.freeze(toPublicModel(primary)),
      fallbackModels: Object.freeze(fallbacks.map((entry) => Object.freeze(toPublicModel(entry)))),
      reasoningEffort: policy.reasoningEffort,
      timeoutMs: policy.timeoutMs,
      maxRetries: policy.maxRetries,
      reasonCode: policy.reasonCode,
      reason: policy.reason,
    });
  };
}

const routeModel = createModelRouter();

export {
  COMPLEXITIES,
  MAX_ESTIMATED_INPUT_TOKENS,
  createModelRouter,
  routeModel,
  supportsPolicy,
  validateRouteInput,
};
