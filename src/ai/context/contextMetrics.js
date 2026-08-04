import { CATEGORY_BY_TYPE } from './contextSelector.js';

const NORMALIZED_CONTEXT_TYPES = Object.freeze([
  'instructions',
  'conversation',
  'memories',
  'rag',
  'toolResults',
  'applicationState',
]);

const NORMALIZED_TYPE_BY_ITEM_TYPE = Object.freeze({
  instruction: 'instructions',
  security_instruction: 'instructions',
  planner_guidance: 'instructions',
  message: 'conversation',
  summary: 'conversation',
  memory: 'memories',
  rag_document: 'rag',
  tool_result: 'toolResults',
  application_state: 'applicationState',
});

function nonNegativeInteger(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0
    ? Math.floor(normalized)
    : fallback;
}

function emptyNormalizedTokenCounts() {
  return Object.fromEntries(NORMALIZED_CONTEXT_TYPES.map((type) => [type, 0]));
}

function normalizedTokensByContextType(items = []) {
  return items.reduce((counts, item) => {
    const type = NORMALIZED_TYPE_BY_ITEM_TYPE[item?.type];
    if (type) counts[type] += nonNegativeInteger(item?.estimatedTokens);
    return counts;
  }, emptyNormalizedTokenCounts());
}

function toNormalizedContextTelemetry(metrics = {}) {
  const candidateContextItems = nonNegativeInteger(metrics.candidateContextItems);
  const selectedContextItems = Math.min(
    candidateContextItems,
    nonNegativeInteger(metrics.selectedContextItems)
  );
  const suppliedTokenCounts = metrics.tokensByContextType || {};
  const tokensByContextType = Object.fromEntries(NORMALIZED_CONTEXT_TYPES.map((type) => [
    type,
    nonNegativeInteger(suppliedTokenCounts[type]),
  ]));
  const estimatedInputTokens = nonNegativeInteger(
    metrics.inputTokens ?? metrics.estimatedInputTokens
  );

  return {
    candidateContextItems,
    selectedContextItems,
    discardedContextItems: Math.max(0, candidateContextItems - selectedContextItems),
    inputTokens: estimatedInputTokens,
    inputTokenSource: metrics.inputTokenSource === 'actual' ? 'actual' : 'estimated',
    tokensByContextType,
    compactionTriggered: metrics.compactionTriggered === true,
    summaryVersion: metrics.summaryVersion !== null
      && metrics.summaryVersion !== undefined
      && Number.isInteger(Number(metrics.summaryVersion))
      && Number(metrics.summaryVersion) >= 0
      ? Number(metrics.summaryVersion)
      : null,
    memoriesRetrieved: nonNegativeInteger(metrics.memoriesRetrieved),
    ragChunksSelected: nonNegativeInteger(metrics.ragChunksSelected),
    toolResultsCompacted: nonNegativeInteger(metrics.toolResultsCompacted),
    contextBuildLatency: nonNegativeInteger(metrics.contextBuildLatency ?? metrics.durationMs),
  };
}

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
  conflictResolutionCount = 0,
  memoriesRetrieved = 0,
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

  const candidateContextItems = nonNegativeInteger(candidates.length);
  const selectedContextItems = nonNegativeInteger(selected.length);
  const discardedContextItems = Math.max(0, candidateContextItems - selectedContextItems);
  const inputTokens = selected.reduce(
    (total, item) => total + nonNegativeInteger(item.estimatedTokens),
    0
  );
  const compactionTriggered = provenance.some((entry) => (
    (entry.transformations || []).some((transformation) => transformation.includes('compaction'))
  ));
  const selectedSummary = selected.find((item) => item.type === 'summary');
  const summaryVersion = Number.isInteger(Number(selectedSummary?.metadata?.summaryVersion))
    && Number(selectedSummary.metadata.summaryVersion) >= 0
    ? Number(selectedSummary.metadata.summaryVersion)
    : null;
  const ragChunksSelected = selected
    .filter((item) => item.type === 'rag_document')
    .reduce((total, item) => total + Math.max(
      1,
      nonNegativeInteger(item.metadata?.ragChunksSelected)
    ), 0);
  const toolResultsCompacted = candidates.filter((item) => (
    item.type === 'tool_result'
    && (item.transformationHistory || []).includes('tool_result_compaction')
  )).length;
  const contextBuildLatency = nonNegativeInteger(durationMs);

  return {
    stage,
    task,
    model,
    candidateContextItems,
    selectedContextItems,
    discardedContextItems,
    inputTokens,
    inputTokenSource: 'estimated',
    tokensByContextType: normalizedTokensByContextType(selected),
    compactionTriggered,
    summaryVersion,
    memoriesRetrieved: nonNegativeInteger(memoriesRetrieved),
    ragChunksSelected,
    toolResultsCompacted,
    contextBuildLatency,
    modelInputLimit: budget.modelInputLimit,
    reservedOutputTokens: budget.reservedOutputTokens,
    safetyMarginTokens: budget.safetyMarginTokens,
    effectiveInputBudget: budget.effectiveInputBudget,
    policyAllocations: budget.policyAllocations,
    categoryBudgets: budget.categories,
    estimatedInputTokens: inputTokens,
    utilizationRatio: Number((
      selected.reduce((total, item) => total + item.estimatedTokens, 0)
      / budget.effectiveInputBudget
    ).toFixed(6)),
    candidateItemCount: candidateContextItems,
    selectedItemCount: selectedContextItems,
    droppedItemCount: dropped.length,
    deduplicatedItemCount: provenance.filter((entry) => entry.selectionReason === 'duplicate').length,
    compactedItemCount: provenance.filter((entry) => entry.transformations
      .some((transformation) => transformation.includes('compaction'))).length,
    expiredItemCount: provenance.filter((entry) => entry.selectionReason === 'expired').length,
    invalidItemCount: provenance.filter((entry) => entry.selectionReason === 'invalid').length,
    unresolvedConflictCount,
    conflictResolutionCount,
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
  NORMALIZED_CONTEXT_TYPES,
  buildDiscardedContextStatistics,
  buildContextMetrics,
  emptyNormalizedTokenCounts,
  nonNegativeInteger,
  normalizedTokensByContextType,
  toNormalizedContextTelemetry,
};
