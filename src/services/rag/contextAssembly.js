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

export function summarizeRetrievedChunk(document = {}, index = 0) {
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
