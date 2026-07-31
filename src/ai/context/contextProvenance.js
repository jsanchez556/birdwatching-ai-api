function createProvenance(item, overrides = {}) {
  return {
    contextItemId: item.id,
    type: item.type,
    source: item.source,
    sourceId: item.metadata?.sourceId || item.id,
    trustLevel: item.trustLevel,
    createdAt: item.createdAt,
    selected: false,
    selectionReason: 'not_evaluated',
    transformations: [],
    duplicateOf: null,
    conflictGroup: item.metadata?.conflictGroup || null,
    originalEstimatedTokens: item.estimatedTokens,
    finalEstimatedTokens: item.estimatedTokens,
    ...overrides,
  };
}

function toSafeProvenance(provenance = []) {
  return provenance.map((entry) => ({
    contextItemId: entry.contextItemId,
    type: entry.type,
    source: entry.source,
    sourceId: entry.sourceId,
    trustLevel: entry.trustLevel,
    createdAt: entry.createdAt,
    selected: entry.selected,
    selectionReason: entry.selectionReason,
    transformations: entry.transformations,
    duplicateOf: entry.duplicateOf,
    conflictGroup: entry.conflictGroup,
    originalEstimatedTokens: entry.originalEstimatedTokens,
    finalEstimatedTokens: entry.finalEstimatedTokens,
  }));
}

export {
  createProvenance,
  toSafeProvenance,
};
