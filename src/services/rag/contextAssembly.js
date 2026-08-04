import { createStableHash } from '../../utils/hash.utils.js';

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

export function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => hasValue(entryValue))
  );
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Number(score.toFixed(6)) : undefined;
}

function ragValidity(document = {}) {
  const expirationValue = document.expiresAt || document.metadata?.expiresAt;
  if (!expirationValue) return { validityStatus: 'valid', isValid: true };
  const expiration = new Date(expirationValue);
  if (Number.isNaN(expiration.getTime())) {
    return { validityStatus: 'invalid_expiration', isValid: false };
  }
  const referenceTime = document.retrievedAt
    ? new Date(document.retrievedAt).getTime()
    : Date.now();
  const isValid = expiration.getTime() > (
    Number.isFinite(referenceTime) ? referenceTime : Date.now()
  );
  return {
    validityStatus: isValid ? 'valid' : 'expired',
    isValid,
  };
}

export function summarizeRetrievedChunk(document = {}, index = 0) {
  const expiresAt = document.expiresAt || document.metadata?.expiresAt || null;
  return compactObject({
    index,
    id: document.id,
    documentId: document.documentId,
    chunkId: document.chunkId,
    chunkIndex: document.chunkIndex,
    name: document.name || document.title,
    source: document.source,
    category: document.category,
    documentType: document.documentType,
    locations: document.locations,
    similarityScore: normalizeScore(document.score),
    semanticScore: normalizeScore(document.semanticScore),
    keywordScore: normalizeScore(document.keywordScore),
    mediaPriority: normalizeScore(document.mediaPriority),
    rerankScore: normalizeScore(document.rerankScore),
    queryRelevance: normalizeScore(document.queryRelevance),
    verificationScore: normalizeScore(document.verificationScore),
    recencyScore: normalizeScore(document.recencyScore),
    citationId: document.citationId,
    compressed: document.compressed === true ? true : undefined,
    contradiction: document.metadata?.contradiction === true ? true : undefined,
    estimatedTokens: document.estimatedTokens,
    textLength: document.text?.length || document.description?.length || 0,
    provenance: {
      sourceType: 'knowledge_document',
      sourceId: `${document.documentId ?? document.id}:${document.chunkId ?? document.chunkIndex ?? 'chunk'}`,
      retrievedAt: document.retrievedAt || new Date().toISOString(),
      trustLevel: document.verificationScore === 1 ? 'verified' : 'unverified',
      expiresAt,
      originalContentHash: document.originalContentHash
        || createStableHash(document.text || document.description || ''),
      ...ragValidity(document),
      transformations: [
        'metadata_filtering',
        'permission_filtering',
        'near_duplicate_deduplication',
        'query_reranking',
        'contradiction_detection',
        ...(document.compressed ? ['extractive_compression'] : []),
        'token_budgeting',
        'citation_assembly',
      ],
    },
  });
}

export function summarizeRetrievedChunks(documents = []) {
  return documents.map(summarizeRetrievedChunk);
}

export function buildGroundingTrace({
  documents = [],
  sources = [],
  promptMessages = [],
  originalMessageCount = 0,
} = {}) {
  const contextMessage = promptMessages.find((message, index) => (
    index > 0
    && message?.role === 'system'
    && typeof message.content === 'string'
    && message.content.includes('retrieved Costa Rica bird knowledge')
  ));

  return {
    retrievedChunkCount: documents.length,
    sourceCount: sources.length,
    originalMessageCount,
    groundedMessageCount: promptMessages.length,
    contextMessageLength: contextMessage?.content?.length || 0,
    retrievedChunks: summarizeRetrievedChunks(documents),
    selectionPipeline: documents[0]?.selectionReport || {
      candidateCount: documents.length,
      selectedCount: documents.length,
    },
    sources: sources.map((source, index) => compactObject({
      index,
      name: source.name,
      location: source.location,
      similarityScore: normalizeScore(source.similarityScore),
    })),
  };
}
