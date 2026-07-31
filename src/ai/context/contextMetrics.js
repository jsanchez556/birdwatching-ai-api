import { CATEGORY_BY_TYPE } from './contextSelector.js';

function countBy(items, keySelector) {
  return items.reduce((counts, item) => {
    const key = keySelector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sumBy(items, keySelector, valueSelector) {
  return items.reduce((totals, item) => {
    const key = keySelector(item);
    totals[key] = (totals[key] || 0) + valueSelector(item);
    return totals;
  }, {});
}

function buildDiscardedContextStatistics(provenance = []) {
  const discarded = provenance.filter((entry) => !entry.selected);
  const categoryFor = (entry) => CATEGORY_BY_TYPE[entry.type] || 'unknown';
  const tokensFor = (entry) => Number(entry.originalEstimatedTokens) || 0;

  return {
    itemCount: discarded.length,
    estimatedTokens: discarded.reduce((total, entry) => total + tokensFor(entry), 0),
    countsByCategory: countBy(discarded, categoryFor),
    tokensByCategory: sumBy(discarded, categoryFor, tokensFor),
    countsByReason: countBy(discarded, (entry) => entry.selectionReason),
    tokensByReason: sumBy(discarded, (entry) => entry.selectionReason, tokensFor),
  };
}

function sumTokensByType(items) {
  return items.reduce((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + item.estimatedTokens;
    return counts;
  }, {});
}

function buildContextMetrics({
  stage,
  task,
  model,
  budget,
  candidates,
  selected,
  provenance,
  durationMs,
  degradedSources = [],
  unresolvedConflictCount = 0,
} = {}) {
  const dropped = provenance.filter((entry) => !entry.selected);
  const discardedContext = buildDiscardedContextStatistics(provenance);
  const selectedMessages = selected.filter((item) => item.type === 'message');
  const preservedMessageCountsByReason = selectedMessages.reduce((counts, item) => {
    for (const reason of item.metadata?.preservationReasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
    return counts;
  }, {});

  return {
    stage,
    task,
    model,
    modelInputLimit: budget.modelInputLimit,
    reservedOutputTokens: budget.reservedOutputTokens,
    safetyMarginTokens: budget.safetyMarginTokens,
    effectiveInputBudget: budget.effectiveInputBudget,
    policyAllocations: budget.policyAllocations,
    categoryBudgets: budget.categories,
    estimatedInputTokens: selected.reduce((total, item) => total + item.estimatedTokens, 0),
    utilizationRatio: Number((
      selected.reduce((total, item) => total + item.estimatedTokens, 0)
      / budget.effectiveInputBudget
    ).toFixed(6)),
    candidateItemCount: candidates.length,
    selectedItemCount: selected.length,
    droppedItemCount: dropped.length,
    deduplicatedItemCount: provenance.filter((entry) => entry.selectionReason === 'duplicate').length,
    compactedItemCount: provenance.filter((entry) => entry.transformations.includes('compacted')).length,
    expiredItemCount: provenance.filter((entry) => entry.selectionReason === 'expired').length,
    invalidItemCount: provenance.filter((entry) => entry.selectionReason === 'invalid').length,
    unresolvedConflictCount,
    tokenCountsByType: sumTokensByType(selected),
    selectedCountsByType: countBy(selected, (item) => item.type),
    droppedCountsByReason: countBy(dropped, (entry) => entry.selectionReason),
    discardedContext,
    preservedMessageCountsByReason,
    durationMs,
    degradedSources: [...new Set(degradedSources)].sort(),
  };
}

export {
  buildDiscardedContextStatistics,
  buildContextMetrics,
};
