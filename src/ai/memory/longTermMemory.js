import userMemoryQueries from '../../db/queries/userMemory.queries.js';
import { estimateTokens } from '../context/contextBudget.js';
import { cleanComparableText } from '../../utils/text.utils.js';

const DEFAULT_CANDIDATE_LIMIT = 50;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MAX_MEMORY_TOKENS = 256;
const DEFAULT_MIN_CONFIDENCE = 0.85;
const DEFAULT_MIN_SEMANTIC_SIMILARITY = 0.45;
const DEFAULT_MAX_AGE_DAYS = 730;
const MILLISECONDS_PER_DAY = 86_400_000;

const defaultEmbeddingClient = {
  async generateEmbedding(...args) {
    const { default: openaiClient } = await import('../clients/openai.client.js');
    return openaiClient.generateEmbedding(...args);
  },
};

function clampScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right)
    || left.length === 0 || left.length !== right.length) return 0;

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return clampScore(dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)));
}

function memoryAgeDays(createdAt, now = new Date()) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / MILLISECONDS_PER_DAY);
}

function memoryRecencyScore(createdAt, now = new Date()) {
  const ageDays = memoryAgeDays(createdAt, now);
  if (!Number.isFinite(ageDays)) return 0;
  return Number(Math.exp(-ageDays / 365).toFixed(6));
}

function isEligibleMemory(memory, {
  now,
  minConfidence,
  maxAgeDays,
}) {
  const confidence = Number(memory?.confidence);
  const expiresAt = memory?.expiresAt ? new Date(memory.expiresAt).getTime() : null;
  return Boolean(
    memory
    && memory.isActive !== false
    && (memory.supersededById === null || memory.supersededById === undefined)
    && typeof memory.content === 'string'
    && memory.content.trim()
    && Number.isFinite(confidence)
    && confidence >= minConfidence
    && memoryAgeDays(memory.createdAt, now) <= maxAgeDays
    && (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now.getTime()))
  );
}

function combinedRelevanceScore({ semanticSimilarity, confidence, recencyScore }) {
  return Number((
    clampScore(semanticSimilarity) * 0.7
    + clampScore(confidence) * 0.2
    + clampScore(recencyScore) * 0.1
  ).toFixed(6));
}

function compareRankedMemories(left, right) {
  if (left.relevanceScore !== right.relevanceScore) {
    return right.relevanceScore - left.relevanceScore;
  }
  const dateDifference = new Date(right.memory.createdAt).getTime()
    - new Date(left.memory.createdAt).getTime();
  return dateDifference || Number(left.memory.id) - Number(right.memory.id);
}

function deduplicateRankedMemories(memories) {
  const seen = new Set();
  return memories.filter((entry) => {
    const fingerprint = `${entry.memory.category}:${cleanComparableText(entry.memory.content)}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function applyMemoryTokenLimit(memories, {
  maxMemoryTokens,
  maxResults,
  tokenEstimator,
}) {
  const selected = [];
  let usedTokens = 0;
  for (const entry of memories) {
    if (selected.length >= maxResults) break;
    const memoryTokens = tokenEstimator(entry.memory.content);
    if (!Number.isSafeInteger(memoryTokens) || memoryTokens < 1) continue;
    if (usedTokens + memoryTokens > maxMemoryTokens) continue;
    selected.push({ ...entry, memoryTokens });
    usedTokens += memoryTokens;
  }
  return selected;
}

class NoopLongTermMemory {
  async retrieve() {
    return [];
  }
}

class PostgresLongTermMemory {
  constructor({
    queries = userMemoryQueries,
    embeddingClient = defaultEmbeddingClient,
    tokenEstimator = estimateTokens,
    clock = () => new Date(),
    candidateLimit = DEFAULT_CANDIDATE_LIMIT,
    maxResults = DEFAULT_MAX_RESULTS,
    maxMemoryTokens = DEFAULT_MAX_MEMORY_TOKENS,
    minConfidence = DEFAULT_MIN_CONFIDENCE,
    minSemanticSimilarity = DEFAULT_MIN_SEMANTIC_SIMILARITY,
    maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  } = {}) {
    this.queries = queries;
    this.embeddingClient = embeddingClient;
    this.tokenEstimator = tokenEstimator;
    this.clock = clock;
    this.candidateLimit = candidateLimit;
    this.maxResults = maxResults;
    this.maxMemoryTokens = maxMemoryTokens;
    this.minConfidence = minConfidence;
    this.minSemanticSimilarity = minSemanticSimilarity;
    this.maxAgeDays = maxAgeDays;
  }

  async retrieve({ userId, query, signal, parentTraceId, excludedMemoryIds = [] } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (userId === undefined || userId === null || !normalizedQuery) return [];

    const now = this.clock();
    const memories = await this.queries.getActive(Number(userId), this.candidateLimit);
    const excludedIds = new Set(excludedMemoryIds.map(Number));
    const eligible = memories.filter((memory) => !excludedIds.has(Number(memory.id)))
      .filter((memory) => isEligibleMemory(memory, {
        now,
        minConfidence: this.minConfidence,
        maxAgeDays: this.maxAgeDays,
      }));
    if (eligible.length === 0) return [];

    const embeddings = await this.embeddingClient.generateEmbedding([
      normalizedQuery,
      ...eligible.map((memory) => memory.content),
    ], {
      userId: Number(userId),
      parentTraceId,
      signal,
    });
    const queryEmbedding = embeddings[0];
    const ranked = eligible.map((memory, index) => {
      const semanticSimilarity = cosineSimilarity(queryEmbedding, embeddings[index + 1]);
      const recencyScore = memoryRecencyScore(memory.createdAt, now);
      return {
        memory,
        semanticSimilarity,
        recencyScore,
        relevanceScore: combinedRelevanceScore({
          semanticSimilarity,
          confidence: memory.confidence,
          recencyScore,
        }),
      };
    }).filter((entry) => entry.semanticSimilarity >= this.minSemanticSimilarity)
      .sort(compareRankedMemories);

    return applyMemoryTokenLimit(deduplicateRankedMemories(ranked), {
      maxMemoryTokens: this.maxMemoryTokens,
      maxResults: this.maxResults,
      tokenEstimator: this.tokenEstimator,
    }).map((entry) => ({
      id: `user-memory:${entry.memory.id}`,
      content: entry.memory.content,
      createdAt: entry.memory.createdAt,
      retrievedAt: now.toISOString(),
      expiresAt: entry.memory.expiresAt,
      relevanceScore: entry.relevanceScore,
      recencyScore: entry.recencyScore,
      trustLevel: entry.memory.inferred === true
        ? 'inferred_user_memory'
        : 'explicit_user_memory',
      source: 'long_term_memory',
      sourceType: 'long_term_memory',
      sourceId: entry.memory.sourceMessageId,
      metadata: {
        memoryId: entry.memory.id,
        sourceMessageId: entry.memory.sourceMessageId,
        category: entry.memory.category,
        confidence: Number(entry.memory.confidence),
        semanticSimilarity: entry.semanticSimilarity,
        recencyScore: entry.recencyScore,
        memoryTokens: entry.memoryTokens,
        isUserEditable: entry.memory.isUserEditable,
        ownerUserId: Number(userId),
        inferred: entry.memory.inferred === true,
        scope: {
          kind: 'user',
          tenantId: null,
          userId: String(userId),
          conversationId: null,
        },
        resolution: entry.memory.resolution || 'none',
        transformations: [
          'confidence_filtering',
          'recency_filtering',
          'semantic_retrieval',
          'memory_deduplication',
          'token_budgeting',
        ],
        ...(entry.memory.conflictKey
          ? { conflictGroup: `${entry.memory.category}:${entry.memory.conflictKey}` }
          : {}),
      },
    }));
  }
}

export {
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_MEMORY_TOKENS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_MIN_SEMANTIC_SIMILARITY,
  NoopLongTermMemory,
  PostgresLongTermMemory,
  applyMemoryTokenLimit,
  combinedRelevanceScore,
  cosineSimilarity,
  deduplicateRankedMemories,
  isEligibleMemory,
  memoryAgeDays,
  memoryRecencyScore,
};

export default new PostgresLongTermMemory();
