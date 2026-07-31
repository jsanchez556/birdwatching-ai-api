import openaiClient from '../clients/openai.client.js';
import logger from '../../utils/logger.js';
import vectorRepository from '../../db/repositories/vector/vector.repository.js';
import ragContextSelector from '../../services/rag/contextSelection.js';

const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 1;
const DEFAULT_CANDIDATE_MULTIPLIER = 4;
const MAX_CANDIDATE_LIMIT = 50;

function normalizeFilters(options = {}) {
  const filters = {
    ...(options.filters || {}),
  };

  for (const key of ['category', 'location', 'title', 'source', 'documentType', 'type', 'locale', 'tags', 'metadata', 'active']) {
    if (options[key] !== undefined && filters[key] === undefined) {
      filters[key] = options[key];
    }
  }

  return filters;
}

function diversifyByDocument(documents, maxChunksPerDocument = DEFAULT_MAX_CHUNKS_PER_DOCUMENT) {
  const limit = Number(maxChunksPerDocument);

  if (!Number.isInteger(limit) || limit < 1) {
    return documents;
  }

  const countsByDocument = new Map();

  return documents.filter((document) => {
    const key = document.documentId || document.id;
    const count = countsByDocument.get(key) || 0;

    if (count >= limit) {
      return false;
    }

    countsByDocument.set(key, count + 1);
    return true;
  });
}

function normalizeResultLimit(limit) {
  const parsedLimit = Number(limit);
  return Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 3;
}

function calculateCandidateLimit(limit, multiplier = DEFAULT_CANDIDATE_MULTIPLIER) {
  const resultLimit = normalizeResultLimit(limit);
  const normalizedMultiplier = Number.isFinite(Number(multiplier)) && Number(multiplier) > 1
    ? Number(multiplier)
    : DEFAULT_CANDIDATE_MULTIPLIER;
  return Math.min(Math.max(resultLimit + 1, Math.ceil(resultLimit * normalizedMultiplier)), MAX_CANDIDATE_LIMIT);
}

function mapRetrievedChunk(row) {
  const documentMetadata = row.document_metadata || {};
  const chunkMetadata = row.chunk_metadata || {};
  const metadata = {
    ...documentMetadata,
    ...chunkMetadata,
  };

  return {
    id: row.external_id || row.document_id,
    documentId: row.document_id,
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    name: row.title,
    title: row.title,
    source: row.source,
    category: row.category,
    documentType: row.document_type,
    locale: row.locale,
    tags: row.tags || [],
    locations: metadata.locations || 'Unknown',
    description: metadata.description || row.content,
    text: row.content,
    metadata,
    documentMetadata,
    chunkMetadata,
    score: Number(row.score),
    semanticScore: Number(row.semantic_score ?? row.score),
    keywordScore: Number(row.keyword_score ?? 0),
    mediaPriority: Number(row.media_priority ?? 0),
    active: row.active !== false,
    documentUpdatedAt: row.document_updated_at,
    chunkUpdatedAt: row.chunk_updated_at,
  };
}

class RetrievalService {
  constructor({ selector = ragContextSelector } = {}) {
    this.selector = selector;
  }

  async retrieve(query, options = {}) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const [embedding] = await openaiClient.generateEmbedding([query], {
      userId: options.userId,
      parentTraceId: options.parentTraceId,
    });
    const filters = normalizeFilters(options);
    const resultLimit = normalizeResultLimit(options.topK || options.limit);
    const candidateLimit = calculateCandidateLimit(resultLimit, options.candidateMultiplier);
    const rows = await vectorRepository.searchSimilar(embedding, {
      limit: candidateLimit,
      filters,
      minScore: options.minScore,
      minSemanticScore: options.minSemanticScore,
      queryText: query,
      semanticWeight: options.semanticWeight,
      keywordWeight: options.keywordWeight,
    });
    const candidates = rows.map(mapRetrievedChunk);
    const selection = this.selector.select(candidates, query, {
      filters,
      userId: options.userId,
      role: options.role,
      resultLimit,
      tokenBudget: options.ragTokenBudget,
      maxChunkTokens: options.maxChunkTokens,
      nearDuplicateThreshold: options.nearDuplicateThreshold,
      maxChunksPerDocument: options.maxChunksPerDocument ?? DEFAULT_MAX_CHUNKS_PER_DOCUMENT,
    });
    const documents = selection.documents.map((document, index) => ({
      ...document,
      ...(index === 0 ? { selectionReport: selection.report } : {}),
    }));

    logger.info('Retrieved vector RAG context', {
      resultCount: documents.length,
      topK: resultLimit,
      candidateLimit,
      filters,
      maxChunksPerDocument: options.maxChunksPerDocument ?? DEFAULT_MAX_CHUNKS_PER_DOCUMENT,
      selection: selection.report,
    });

    return documents;
  }
}

export {
  calculateCandidateLimit,
  RetrievalService,
  diversifyByDocument,
  mapRetrievedChunk,
  normalizeFilters,
};
export default new RetrievalService();
