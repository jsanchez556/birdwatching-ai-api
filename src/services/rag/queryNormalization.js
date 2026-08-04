import { buildHashKey } from '../../utils/hash.utils.js';

const DEFAULT_TOP_K = 3;

export function normalizeRagQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRetrievalCacheKey(question, options = {}) {
  return buildHashKey('rag-retrieval', {
    query: normalizeRagQuery(question),
    topK: options.topK || DEFAULT_TOP_K,
    filters: options.filters || {},
    minScore: options.minScore,
    minSemanticScore: options.minSemanticScore,
    maxChunksPerDocument: options.maxChunksPerDocument,
    candidateMultiplier: options.candidateMultiplier,
    semanticWeight: options.semanticWeight,
    keywordWeight: options.keywordWeight,
    retrievalVariant: options.retrievalVariant,
    userId: options.userId,
    tenantId: options.tenantId,
    role: options.role,
    ragTokenBudget: options.ragTokenBudget,
    maxChunkTokens: options.maxChunkTokens,
    nearDuplicateThreshold: options.nearDuplicateThreshold,
    selectionPipelineVersion: '1.1.0',
  });
}
