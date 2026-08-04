const STRATEGY_SET = new Set(['full_history', 'last_n', 'dynamic']);

function datasetError(message, details = {}) {
  return Object.assign(new Error(message), {
    code: 'CONTEXT_EVALUATION_DATASET_INVALID',
    details,
  });
}

function validateContextStrategyDataset(dataset) {
  if (!dataset || dataset.schemaVersion !== 1 || typeof dataset.datasetVersion !== 'string') {
    throw datasetError('Context evaluation dataset header is invalid.');
  }
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
    throw datasetError('Context evaluation dataset requires at least one case.');
  }
  const ids = new Set();
  for (const [index, entry] of dataset.cases.entries()) {
    const requiredArrays = [
      'conversation', 'memories', 'ragCandidates', 'defaultRagChunkIds', 'toolResults',
      'expectedRelevantContextIds', 'mustExcludeContextIds', 'deterministicAssertions',
      'eligibleStrategies',
    ];
    if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id)) {
      throw datasetError('Context evaluation case ID is invalid.', { index });
    }
    if (ids.has(entry.id)) throw datasetError('Context evaluation case IDs must be unique.', { id: entry.id });
    ids.add(entry.id);
    if (typeof entry.currentRequest !== 'string' || !entry.currentRequest.trim()
      || typeof entry.referenceAnswer !== 'string') {
      throw datasetError('Context evaluation case text fields are invalid.', { id: entry.id });
    }
    if (requiredArrays.some((field) => !Array.isArray(entry[field]))) {
      throw datasetError('Context evaluation case array fields are invalid.', { id: entry.id });
    }
    if (entry.eligibleStrategies.some((strategy) => !STRATEGY_SET.has(strategy))) {
      throw datasetError('Context evaluation case strategy is invalid.', { id: entry.id });
    }
    if (!entry.assertions || typeof entry.assertions !== 'object'
      || !entry.scope || typeof entry.scope !== 'object') {
      throw datasetError('Context evaluation assertions or scope are missing.', { id: entry.id });
    }
  }
  return dataset;
}

export { STRATEGY_SET, datasetError, validateContextStrategyDataset };
