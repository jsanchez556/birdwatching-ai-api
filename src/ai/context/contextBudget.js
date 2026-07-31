import HttpError from '../../utils/httpError.js';
import { MODEL_REGISTRY } from '../routing/modelRegistry.js';

const UNKNOWN_MODEL_INPUT_LIMIT = 16_000;
const UNROUTED_MODEL_KEY = 'unrouted';
const DEFAULT_RESERVED_OUTPUT_TOKENS = 2_000;
const DEFAULT_SAFETY_MARGIN_TOKENS = 512;
const DEFAULT_CATEGORY_OVERFLOW_MULTIPLIER = 1.25;

const POLICY_CATEGORY_MAP = Object.freeze({
  recentConversation: 'conversation',
  longTermMemory: 'memories',
  retrievedKnowledge: 'retrievedKnowledge',
  toolResults: 'toolResults',
  applicationState: 'applicationState',
});

function freezeContextPolicy({ reservedOutputTokens, allocations }) {
  return Object.freeze({
    reservedOutputTokens,
    ...allocations,
  });
}

const CONTEXT_POLICIES = Object.freeze({
  general_chat: freezeContextPolicy({
    reservedOutputTokens: 1_500,
    allocations: {
      recentConversation: 0.45,
      longTermMemory: 0.15,
      retrievedKnowledge: 0.15,
      toolResults: 0.05,
      applicationState: 0.05,
    },
  }),
  rag_answer: freezeContextPolicy({
    reservedOutputTokens: 2_000,
    allocations: {
      recentConversation: 0.20,
      longTermMemory: 0.10,
      retrievedKnowledge: 0.50,
      toolResults: 0.10,
      applicationState: 0.05,
    },
  }),
  tour_recommendation: freezeContextPolicy({
    reservedOutputTokens: 2_000,
    allocations: {
      recentConversation: 0.20,
      longTermMemory: 0.10,
      retrievedKnowledge: 0.25,
      toolResults: 0.30,
      applicationState: 0.10,
    },
  }),
  reservation_planning: freezeContextPolicy({
    reservedOutputTokens: 2_500,
    allocations: {
      recentConversation: 0.20,
      longTermMemory: 0.05,
      retrievedKnowledge: 0.15,
      toolResults: 0.40,
      applicationState: 0.15,
    },
  }),
  tool_selection: freezeContextPolicy({
    reservedOutputTokens: 2_000,
    allocations: {
      recentConversation: 0.25,
      longTermMemory: 0.05,
      retrievedKnowledge: 0.10,
      toolResults: 0.40,
      applicationState: 0.15,
    },
  }),
  bird_image_analysis: freezeContextPolicy({
    reservedOutputTokens: 2_500,
    allocations: {
      recentConversation: 0.10,
      longTermMemory: 0.05,
      retrievedKnowledge: 0.60,
      toolResults: 0.05,
      applicationState: 0.05,
    },
  }),
});

const FALLBACK_CONTEXT_POLICY = freezeContextPolicy({
  reservedOutputTokens: DEFAULT_RESERVED_OUTPUT_TOKENS,
  allocations: Object.fromEntries(Object.keys(POLICY_CATEGORY_MAP).map((category) => [
    category,
    CONTEXT_POLICIES.general_chat[category],
  ])),
});

function estimateTokens(content) {
  const text = typeof content === 'string' ? content : String(content ?? '');
  if (!text) return 0;

  // Intentionally conservative for mixed prose, JSON, and identifiers.
  return Math.max(1, Math.ceil(text.length / 3));
}

function resolveModelInputLimit(model, registry = MODEL_REGISTRY) {
  if (model === UNROUTED_MODEL_KEY) {
    const configuredLimits = Object.values(registry)
      .filter((entry) => entry.service === 'generation')
      .map((entry) => entry.maxInputTokens)
      .filter((limit) => Number.isSafeInteger(limit) && limit > 0);
    return configuredLimits.length > 0
      ? Math.min(...configuredLimits)
      : UNKNOWN_MODEL_INPUT_LIMIT;
  }

  const candidate = Object.values(registry).find((entry) => (
    entry.service === 'generation'
    && (entry.key === model || entry.modelId === model)
  ));

  return candidate?.maxInputTokens || UNKNOWN_MODEL_INPUT_LIMIT;
}

function contextBudgetError(message, details) {
  return new HttpError(500, message, {
    code: 'CONTEXT_BUDGET_MISCONFIGURED',
    details,
  });
}

function getPolicyAllocations(policy = {}) {
  return Object.fromEntries(Object.keys(POLICY_CATEGORY_MAP).map((category) => [
    category,
    policy.allocations?.[category] ?? policy[category],
  ]));
}

function validateContextPolicy(policy, task) {
  if (!policy || typeof policy !== 'object') {
    throw contextBudgetError('Context policy configuration is invalid.', { task });
  }
  if (!Number.isSafeInteger(policy.reservedOutputTokens)
    || policy.reservedOutputTokens < 0) {
    throw contextBudgetError('Context output reservation is invalid.', { task });
  }

  let allocationTotal = 0;
  const allocations = getPolicyAllocations(policy);
  for (const policyCategory of Object.keys(POLICY_CATEGORY_MAP)) {
    const allocation = Number(allocations[policyCategory]);
    if (!Number.isFinite(allocation) || allocation < 0 || allocation > 1) {
      throw contextBudgetError('Context policy allocation is invalid.', {
        task,
        category: policyCategory,
      });
    }
    allocationTotal += allocation;
  }
  if (allocationTotal > 1 + Number.EPSILON) {
    throw contextBudgetError('Context policy allocations cannot exceed 100%.', {
      task,
      allocationTotal,
    });
  }
}

function resolveContextPolicy(task, contextPolicies = CONTEXT_POLICIES) {
  const base = CONTEXT_POLICIES[task] || FALLBACK_CONTEXT_POLICY;
  const configured = contextPolicies?.[task];
  if (!configured) return base;

  return {
    ...base,
    reservedOutputTokens: configured.reservedOutputTokens
      ?? base.reservedOutputTokens,
    ...(configured.allocations || configured),
  };
}

function buildCategoryBudgets({
  effectiveInputBudget,
  policy,
  overflowMultiplier = DEFAULT_CATEGORY_OVERFLOW_MULTIPLIER,
}) {
  if (!Number.isFinite(overflowMultiplier) || overflowMultiplier < 1) {
    throw contextBudgetError('Context category overflow multiplier is invalid.');
  }

  const categories = {
    instructions: {
      soft: effectiveInputBudget,
      hard: effectiveInputBudget,
    },
  };
  const allocations = getPolicyAllocations(policy);

  for (const [policyCategory, internalCategory] of Object.entries(POLICY_CATEGORY_MAP)) {
    const soft = Math.floor(effectiveInputBudget * allocations[policyCategory]);
    categories[internalCategory] = {
      soft,
      hard: Math.min(
        effectiveInputBudget,
        Math.max(soft, Math.floor(soft * overflowMultiplier))
      ),
    };
  }

  return categories;
}

function createContextBudget({
  model,
  task,
  registry = MODEL_REGISTRY,
  reservedOutputTokens,
  safetyMarginTokens = DEFAULT_SAFETY_MARGIN_TOKENS,
  contextPolicies = CONTEXT_POLICIES,
  categoryOverflowMultiplier = DEFAULT_CATEGORY_OVERFLOW_MULTIPLIER,
} = {}) {
  const modelInputLimit = resolveModelInputLimit(model, registry);
  const policy = resolveContextPolicy(task, contextPolicies);
  const resolvedOutputReservation = reservedOutputTokens
    ?? policy.reservedOutputTokens;
  validateContextPolicy({
    ...policy,
    reservedOutputTokens: resolvedOutputReservation,
  }, task);

  if (!Number.isSafeInteger(safetyMarginTokens) || safetyMarginTokens < 0) {
    throw contextBudgetError('Context token safety margin is invalid.', { task });
  }

  const effectiveInputBudget = modelInputLimit
    - resolvedOutputReservation
    - safetyMarginTokens;

  if (effectiveInputBudget <= 0) {
    throw contextBudgetError('Context token reservation exceeds the model limit.', { task });
  }

  return {
    task,
    modelInputLimit,
    reservedOutputTokens: resolvedOutputReservation,
    safetyMarginTokens,
    effectiveInputBudget,
    policyAllocations: getPolicyAllocations(policy),
    categories: buildCategoryBudgets({
      effectiveInputBudget,
      policy,
      overflowMultiplier: categoryOverflowMultiplier,
    }),
  };
}

export {
  CONTEXT_POLICIES,
  DEFAULT_CATEGORY_OVERFLOW_MULTIPLIER,
  DEFAULT_RESERVED_OUTPUT_TOKENS,
  DEFAULT_SAFETY_MARGIN_TOKENS,
  FALLBACK_CONTEXT_POLICY,
  POLICY_CATEGORY_MAP,
  UNROUTED_MODEL_KEY,
  UNKNOWN_MODEL_INPUT_LIMIT,
  buildCategoryBudgets,
  createContextBudget,
  estimateTokens,
  getPolicyAllocations,
  resolveContextPolicy,
  resolveModelInputLimit,
  validateContextPolicy,
};
