import { estimateTokens } from '../../ai/context/contextBudget.js';
import { normalizeRagQuery } from './queryNormalization.js';
import { createStableHash } from '../../utils/hash.utils.js';

const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.82;
const DEFAULT_RAG_TOKEN_BUDGET = 900;
const DEFAULT_MAX_CHUNK_TOKENS = 180;
const DEFAULT_RESULT_LIMIT = 3;
const DAY_MS = 86_400_000;
const QUERY_STOP_WORDS = new Set([
  'about', 'and', 'are', 'bird', 'birds', 'can', 'for', 'from', 'how', 'in',
  'is', 'near', 'of', 'on', 'the', 'to', 'what', 'where', 'which', 'with',
]);

function clampScore(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function normalizeString(value) {
  return String(value ?? '').trim().toLowerCase();
}

function documentContent(document = {}) {
  return String(document.text || document.description || '').trim();
}

function documentKey(document = {}) {
  return `${document.documentId ?? document.id ?? 'document'}:${document.chunkId ?? document.chunkIndex ?? 'chunk'}`;
}

function tokenize(value) {
  return normalizeRagQuery(value)
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter((token) => !QUERY_STOP_WORDS.has(token));
}

function tokenSet(value) {
  return new Set(tokenize(value));
}

function jaccardSimilarity(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function textPolarity(value) {
  const tokens = new Set(normalizeRagQuery(value).split(/\s+/).filter(Boolean));
  return [...tokens].some((token) => ['no', 'not', 'never', 'without'].includes(token))
    ? 'negative'
    : 'positive';
}

function areNearDuplicates(left, right, threshold = DEFAULT_NEAR_DUPLICATE_THRESHOLD) {
  if (textPolarity(left) !== textPolarity(right)) return false;
  return jaccardSimilarity(left, right) >= threshold;
}

function parseDate(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function verificationScore(document = {}) {
  const metadata = document.metadata || {};
  if (metadata.verified === true || metadata.verificationStatus === 'verified') return 1;
  if (metadata.verified === false || metadata.verificationStatus === 'rejected') return 0;
  return 0.5;
}

function recencyScore(document = {}, now = new Date()) {
  const metadata = document.metadata || {};
  const timestamp = parseDate(
    metadata.lastVerifiedAt
    || metadata.updatedAt
    || metadata.sourceUpdatedAt
    || document.chunkUpdatedAt
    || document.documentUpdatedAt
  );
  if (timestamp === null) return 0.4;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / DAY_MS);
  return Number(Math.exp(-ageDays / 365).toFixed(6));
}

function permissionAllows(document = {}, { userId, tenantId, role } = {}) {
  const metadata = document.documentMetadata || document.metadata || {};
  const visibility = normalizeString(metadata.visibility || 'public');
  const normalizedRole = normalizeString(role || (userId == null ? 'visitor' : 'customer'));
  const normalizedUserId = userId == null ? null : String(userId);
  const normalizedTenantId = tenantId == null ? null : String(tenantId);
  if (!['public', 'authenticated', 'admin', 'private'].includes(visibility)) return false;
  if (visibility === 'authenticated' && normalizedUserId === null) return false;
  if (visibility === 'admin' && normalizedRole !== 'admin') return false;
  if (visibility === 'private' && normalizedUserId === null) return false;
  if (metadata.ownerUserId != null && String(metadata.ownerUserId) !== normalizedUserId) return false;
  if (metadata.ownerTenantId != null
    && String(metadata.ownerTenantId) !== normalizedTenantId) return false;

  const allowedRoles = Array.isArray(metadata.allowedRoles)
    ? metadata.allowedRoles.map(normalizeString)
    : [];
  if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) return false;
  const allowedUserIds = Array.isArray(metadata.allowedUserIds)
    ? metadata.allowedUserIds.map(String)
    : [];
  if (allowedUserIds.length > 0 && !allowedUserIds.includes(normalizedUserId)) return false;
  if (visibility === 'private' && metadata.ownerUserId == null && allowedUserIds.length === 0) return false;
  const deniedUserIds = Array.isArray(metadata.deniedUserIds)
    ? metadata.deniedUserIds.map(String)
    : [];
  const allowedTenantIds = Array.isArray(metadata.allowedTenantIds)
    ? metadata.allowedTenantIds.map(String)
    : [];
  if (allowedTenantIds.length > 0 && !allowedTenantIds.includes(normalizedTenantId)) return false;
  return normalizedUserId === null || !deniedUserIds.includes(normalizedUserId);
}

function includesCaseInsensitive(value, expected) {
  return normalizeString(value).includes(normalizeString(expected));
}

function matchesMetadataFilters(document = {}, filters = {}, now = new Date()) {
  const metadata = document.metadata || {};
  if (document.active === false || metadata.active === false) return false;
  const expiresAt = metadata.expiresAt ? parseDate(metadata.expiresAt) : null;
  const effectiveAt = metadata.effectiveAt ? parseDate(metadata.effectiveAt) : null;
  if (metadata.expiresAt && (expiresAt === null || expiresAt <= now.getTime())) return false;
  if (metadata.effectiveAt && (effectiveAt === null || effectiveAt > now.getTime())) return false;
  if (['draft', 'withdrawn', 'rejected'].includes(normalizeString(metadata.publicationStatus))) return false;
  const operationalType = normalizeString(
    metadata.operationalType || document.documentType || metadata.documentType
  );
  if (['availability', 'pricing', 'inventory', 'quote', 'search_result',
    'reservation_draft', 'booking_readiness'].includes(operationalType)
    && !metadata.expiresAt) return false;
  if (filters.active === false) return false;
  if (filters.category && normalizeString(document.category) !== normalizeString(filters.category)) return false;
  if (filters.source && normalizeString(document.source) !== normalizeString(filters.source)) return false;
  if ((filters.documentType || filters.type)
    && normalizeString(document.documentType) !== normalizeString(filters.documentType || filters.type)) return false;
  if (filters.locale && normalizeString(document.locale) !== normalizeString(filters.locale)) return false;
  if (filters.title && !includesCaseInsensitive(document.title || document.name, filters.title)) return false;
  if (filters.location && !includesCaseInsensitive(document.locations || metadata.locations, filters.location)) return false;
  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    const documentTags = new Set((document.tags || []).map(normalizeString));
    if (!filters.tags.some((tag) => documentTags.has(normalizeString(tag)))) return false;
  }
  if (filters.metadata && typeof filters.metadata === 'object') {
    const matches = Object.entries(filters.metadata).every(([key, value]) => (
      JSON.stringify(metadata[key]) === JSON.stringify(value)
    ));
    if (!matches) return false;
  }
  return true;
}

function filterCandidates(candidates = [], options = {}) {
  return candidates.filter((document) => (
    documentContent(document)
    && matchesMetadataFilters(document, options.filters, options.now)
    && permissionAllows(document, options)
  ));
}

function dedupPreferenceScore(document, now) {
  return clampScore(document.score) * 0.5
    + verificationScore(document) * 0.3
    + recencyScore(document, now) * 0.2;
}

function deduplicateCandidates(candidates = [], {
  threshold = DEFAULT_NEAR_DUPLICATE_THRESHOLD,
  now = new Date(),
} = {}) {
  const ranked = [...candidates].sort((left, right) => (
    dedupPreferenceScore(right, now) - dedupPreferenceScore(left, now)
    || documentKey(left).localeCompare(documentKey(right))
  ));
  const retained = [];
  const duplicateMap = new Map();
  for (const candidate of ranked) {
    const duplicate = retained.find((existing) => (
      areNearDuplicates(documentContent(candidate), documentContent(existing), threshold)
    ));
    if (duplicate) {
      const duplicateOf = documentKey(duplicate);
      duplicateMap.set(documentKey(candidate), duplicateOf);
      duplicate.citationAliases = [
        ...(duplicate.citationAliases || []),
        documentKey(candidate),
      ];
      continue;
    }
    retained.push({ ...candidate });
  }
  return { documents: retained, duplicateMap };
}

function queryRelevanceScore(document, query) {
  const queryTokens = new Set(tokenize(query));
  const searchableTokens = tokenSet([
    document.name,
    document.title,
    document.category,
    document.locations,
    documentContent(document),
  ].filter(Boolean).join(' '));
  if (queryTokens.size === 0) return clampScore(document.score, 0);
  const overlap = [...queryTokens].filter((token) => searchableTokens.has(token)).length
    / queryTokens.size;
  return clampScore(clampScore(document.score) * 0.7 + overlap * 0.3);
}

function rerankCandidates(candidates = [], query, { now = new Date() } = {}) {
  return candidates.map((document) => {
    const queryRelevance = queryRelevanceScore(document, query);
    const verified = verificationScore(document);
    const recency = recencyScore(document, now);
    return {
      ...document,
      queryRelevance,
      verificationScore: verified,
      recencyScore: recency,
      rerankScore: Number((queryRelevance * 0.7 + verified * 0.2 + recency * 0.1).toFixed(6)),
    };
  }).sort((left, right) => (
    right.rerankScore - left.rerankScore
    || right.verificationScore - left.verificationScore
    || right.recencyScore - left.recencyScore
    || documentKey(left).localeCompare(documentKey(right))
  ));
}

function detectContradictions(candidates = []) {
  const groups = new Map();
  for (const document of candidates) {
    const metadata = document.metadata || {};
    const claimKey = normalizeString(metadata.claimKey);
    const claimValue = normalizeString(metadata.claimValue);
    if (!claimKey || !claimValue) continue;
    const group = groups.get(claimKey) || [];
    group.push({ document, claimValue });
    groups.set(claimKey, group);
  }

  for (const document of candidates) {
    if (document.metadata?.claimKey && document.metadata?.claimValue) continue;
    for (const sentence of splitSentences(documentContent(document))) {
      const normalized = normalizeRagQuery(sentence);
      const tokens = normalized.split(/\s+/).filter(Boolean);
      const negative = tokens.some((token) => ['no', 'not', 'never', 'without'].includes(token));
      const signature = tokens
        .filter((token) => !['no', 'not', 'never', 'without'].includes(token))
        .join(' ');
      if (!signature || tokens.length < 4) continue;
      const groupKey = `text:${signature}`;
      const group = groups.get(groupKey) || [];
      group.push({ document, claimValue: negative ? 'negative' : 'positive' });
      groups.set(groupKey, group);
    }
  }

  const contradictions = [];
  for (const [claimKey, group] of groups) {
    if (new Set(group.map((entry) => entry.claimValue)).size < 2) continue;
    const chunkKeys = group.map((entry) => documentKey(entry.document)).sort();
    contradictions.push({ claimKey, chunkKeys });
    for (const { document } of group) {
      document.metadata = {
        ...(document.metadata || {}),
        contradiction: true,
        contradictionGroup: claimKey,
        contradictsChunkKeys: chunkKeys.filter((key) => key !== documentKey(document)),
      };
    }
  }
  return contradictions;
}

function splitSentences(content) {
  return content.match(/[^.!?\n]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
}

function compressDocument(document, query, {
  tokenEstimator = estimateTokens,
  maxChunkTokens = DEFAULT_MAX_CHUNK_TOKENS,
} = {}) {
  const content = documentContent(document);
  const originalContentHash = document.originalContentHash || createStableHash(content);
  if (tokenEstimator(content) <= maxChunkTokens) {
    return {
      ...document,
      text: content,
      description: content,
      compressed: false,
      originalContentHash,
    };
  }
  const queryTokens = new Set(tokenize(query));
  const sentences = splitSentences(content).map((sentence, index) => ({
    sentence,
    index,
    overlap: [...tokenSet(sentence)].filter((token) => queryTokens.has(token)).length,
  })).sort((left, right) => right.overlap - left.overlap || left.index - right.index);
  const selected = [];
  let usedTokens = 0;
  for (const candidate of sentences) {
    const sentenceTokens = tokenEstimator(candidate.sentence);
    if (usedTokens + sentenceTokens > maxChunkTokens) continue;
    selected.push(candidate);
    usedTokens += sentenceTokens;
  }
  if (selected.length === 0) {
    const maxCharacters = Math.max(1, maxChunkTokens * 3);
    selected.push({ sentence: content.slice(0, maxCharacters).trim(), index: 0 });
  }
  const compressed = selected.sort((left, right) => left.index - right.index)
    .map((entry) => entry.sentence).join(' ');
  return {
    ...document,
    text: compressed,
    description: compressed,
    compressed: true,
    originalTokenCount: tokenEstimator(content),
    originalContentHash,
  };
}

function estimateDocumentTokens(document, tokenEstimator = estimateTokens) {
  return tokenEstimator([
    document.title || document.name,
    document.source,
    document.locations,
    documentContent(document),
  ].filter(Boolean).join('\n')) + 16;
}

function enforceTokenBudget(candidates = [], {
  resultLimit = DEFAULT_RESULT_LIMIT,
  tokenBudget = DEFAULT_RAG_TOKEN_BUDGET,
  tokenEstimator = estimateTokens,
  maxChunksPerDocument = 1,
} = {}) {
  const selected = [];
  let usedTokens = 0;
  const documentCounts = new Map();
  for (const document of candidates) {
    if (selected.length >= resultLimit) break;
    const identity = document.documentId ?? document.id;
    const documentCount = documentCounts.get(identity) || 0;
    if (Number.isInteger(maxChunksPerDocument)
      && maxChunksPerDocument > 0
      && documentCount >= maxChunksPerDocument) continue;
    const estimatedTokens = estimateDocumentTokens(document, tokenEstimator);
    if (usedTokens + estimatedTokens > tokenBudget) continue;
    selected.push({ ...document, estimatedTokens });
    usedTokens += estimatedTokens;
    documentCounts.set(identity, documentCount + 1);
  }
  return { documents: selected, usedTokens };
}

function assignCitations(documents = []) {
  const citationByChunkKey = new Map(documents.map((document, index) => (
    [documentKey(document), `R${index + 1}`]
  )));
  return documents.map((document, index) => ({
    ...document,
    citationId: `R${index + 1}`,
    citation: {
      id: `R${index + 1}`,
      documentId: document.documentId,
      chunkId: document.chunkId,
      source: document.source,
      title: document.title || document.name,
      aliases: document.citationAliases || [],
    },
    metadata: {
      ...(document.metadata || {}),
      ...(document.metadata?.contradictsChunkKeys ? {
        contradictsCitations: document.metadata.contradictsChunkKeys
          .map((key) => citationByChunkKey.get(key))
          .filter(Boolean),
      } : {}),
    },
  }));
}

class RagContextSelector {
  constructor({ tokenEstimator = estimateTokens, clock = () => new Date() } = {}) {
    this.tokenEstimator = tokenEstimator;
    this.clock = clock;
  }

  select(candidates = [], query, options = {}) {
    const now = this.clock();
    const resultLimit = positiveInteger(options.resultLimit, DEFAULT_RESULT_LIMIT);
    const tokenBudget = positiveInteger(options.tokenBudget, DEFAULT_RAG_TOKEN_BUDGET);
    const maxChunkTokens = positiveInteger(options.maxChunkTokens, DEFAULT_MAX_CHUNK_TOKENS);
    const nearDuplicateThreshold = clampScore(
      options.nearDuplicateThreshold,
      DEFAULT_NEAR_DUPLICATE_THRESHOLD
    );
    const maxChunksPerDocument = positiveInteger(options.maxChunksPerDocument, 1);
    const filtered = filterCandidates(candidates, { ...options, now });
    const deduplicated = deduplicateCandidates(filtered, {
      threshold: positiveNumber(nearDuplicateThreshold, DEFAULT_NEAR_DUPLICATE_THRESHOLD),
      now,
    });
    const reranked = rerankCandidates(deduplicated.documents, query, { now });
    const contradictions = detectContradictions(reranked);
    const compressed = reranked.map((document) => compressDocument(document, query, {
      tokenEstimator: this.tokenEstimator,
      maxChunkTokens,
    }));
    const budgeted = enforceTokenBudget(compressed, {
      resultLimit,
      tokenBudget,
      tokenEstimator: this.tokenEstimator,
      maxChunksPerDocument,
    });
    const documents = assignCitations(budgeted.documents.map((document) => ({
      ...document,
      retrievedAt: now.toISOString(),
      ...(document.metadata?.expiresAt ? { expiresAt: document.metadata.expiresAt } : {}),
    })));
    return {
      documents,
      contradictions,
      report: {
        candidateCount: candidates.length,
        filteredCount: filtered.length,
        deduplicatedCount: deduplicated.documents.length,
        rerankedCount: reranked.length,
        selectedCount: documents.length,
        duplicateCount: deduplicated.duplicateMap.size,
        contradictionCount: contradictions.length,
        usedTokens: budgeted.usedTokens,
        tokenBudget,
      },
    };
  }
}

export {
  DEFAULT_MAX_CHUNK_TOKENS,
  DEFAULT_NEAR_DUPLICATE_THRESHOLD,
  DEFAULT_RAG_TOKEN_BUDGET,
  DEFAULT_RESULT_LIMIT,
  RagContextSelector,
  assignCitations,
  areNearDuplicates,
  compressDocument,
  deduplicateCandidates,
  detectContradictions,
  documentKey,
  enforceTokenBudget,
  filterCandidates,
  jaccardSimilarity,
  matchesMetadataFilters,
  permissionAllows,
  queryRelevanceScore,
  recencyScore,
  rerankCandidates,
  verificationScore,
};

export default new RagContextSelector();
