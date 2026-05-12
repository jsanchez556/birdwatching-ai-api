const MODEL_PRICES_PER_MILLION_TOKENS = {
  'gpt-4o': {
    input: 2.5,
    output: 10,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
};

function normalizeTokenCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getModelPricing(model) {
  const modelName = typeof model === 'string' ? model : '';

  if (MODEL_PRICES_PER_MILLION_TOKENS[modelName]) {
    return MODEL_PRICES_PER_MILLION_TOKENS[modelName];
  }

  const modelFamily = Object.keys(MODEL_PRICES_PER_MILLION_TOKENS)
    .sort((left, right) => right.length - left.length)
    .find((knownModel) => modelName.startsWith(`${knownModel}-`));

  return modelFamily ? MODEL_PRICES_PER_MILLION_TOKENS[modelFamily] : null;
}

function estimateCost(model, usage) {
  const pricing = getModelPricing(model);

  if (!pricing) {
    return null;
  }

  const promptCost = (usage.promptTokens / 1_000_000) * pricing.input;
  const completionCost = (usage.completionTokens / 1_000_000) * pricing.output;

  return Number((promptCost + completionCost).toFixed(6));
}

function getCompletionUsage(completion) {
  const promptTokens = normalizeTokenCount(completion?.usage?.prompt_tokens);
  const completionTokens = normalizeTokenCount(completion?.usage?.completion_tokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens: normalizeTokenCount(completion?.usage?.total_tokens)
      || promptTokens + completionTokens,
  };
}

function createEmptyUsage() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    estimatedCostDisplay: '$0.0000',
    hasEstimatedCost: false,
  };
}

function formatCost(cost) {
  return `$${Number(cost || 0).toFixed(4)}`;
}

export function addCompletionUsage(usageCollector, completion, fallbackModel) {
  const usage = getCompletionUsage(completion);
  const model = completion?.model || fallbackModel;
  const estimatedCostUsd = estimateCost(model, usage);

  if (usageCollector && typeof usageCollector === 'object') {
    const currentUsage = usageCollector.openAiUsage || createEmptyUsage();
    const nextEstimatedCost = estimatedCostUsd === null
      ? currentUsage.estimatedCostUsd
      : currentUsage.estimatedCostUsd + estimatedCostUsd;

    usageCollector.openAiUsage = {
      promptTokens: currentUsage.promptTokens + usage.promptTokens,
      completionTokens: currentUsage.completionTokens + usage.completionTokens,
      totalTokens: currentUsage.totalTokens + usage.totalTokens,
      estimatedCostUsd: Number(nextEstimatedCost.toFixed(6)),
      estimatedCostDisplay: formatCost(nextEstimatedCost),
      hasEstimatedCost: currentUsage.hasEstimatedCost || estimatedCostUsd !== null,
    };
  }

  return {
    ...usage,
    estimatedCostUsd,
    estimatedCostDisplay: estimatedCostUsd === null ? null : formatCost(estimatedCostUsd),
  };
}
