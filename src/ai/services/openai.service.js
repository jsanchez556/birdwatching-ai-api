import agentOrchestrator from '../orchestrators/agent.orchestrator.js';
import openaiClient from '../clients/openai.client.js';
import logger from '../../utils/logger.js';
import HttpError from '../../utils/httpError.js';
import { buildHashKey, createStableHash, stableStringify } from '../../utils/hash.utils.js';
import { CHAT_SYSTEM_PROMPT_VERSION } from '../prompts/system.prompt.js';
import createResponseCache from '../../cache/responseCache.js';
import { getRedisConfig } from '../../cache/redisClient.js';
import { traceCacheOperation } from '../../tracing/aiTracing.middleware.js';
import { formatCurrency, formatPercent, normalizePositiveNumber } from '../../utils/number.utils.js';

const SEMANTIC_RESPONSE_INDEX_KEY = `semantic-response:${CHAT_SYSTEM_PROMPT_VERSION}:index`;

function createEmptyCostOptimizationMetrics() {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    estimatedSavingsUsd: 0,
  };
}

const normalizeEstimatedCost = normalizePositiveNumber;

function buildResponseCacheKey(messages, metadata = {}) {
  const payload = {
    messages,
    promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
    role: metadata.role,
    responseMode: metadata.responseMode,
  };
  return buildHashKey('ai-response', payload);
}

function buildSemanticScope(metadata = {}) {
  return Object.fromEntries(Object.entries({
    promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
    role: metadata.role,
    responseMode: metadata.responseMode,
  }).filter(([, value]) => value !== undefined));
}

function getLatestUserQuestion(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === 'user' && typeof message.content === 'string')
    ?.content
    ?.trim() || '';
}

function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);

    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return 0;
    }

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function sameSemanticScope(left = {}, right = {}) {
  return stableStringify(left) === stableStringify(right);
}

function pruneSemanticEntries(entries = [], {
  now = Date.now(),
  maxEntries = 100,
} = {}) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry?.response && Array.isArray(entry.embedding))
    .filter((entry) => !entry.expiresAt || entry.expiresAt > now)
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
    .slice(0, maxEntries);
}

function hasCacheUnsafeMetadata(metadata = {}) {
  return Boolean(
    metadata.customerContext
    || metadata.conversationContext
    || metadata.authUser
    || metadata.userId
    || metadata.reservation
    || metadata.selectedTour
    || metadata.selectedTourId
    || metadata.selectedTransportation
    || metadata.transportationDeclined
    || metadata.requestedTransportation
    || metadata.pricing
    || metadata.uiAction
    || metadata.participants
    || metadata.toolsCalled?.length
  );
}

class OpenAIService {
  constructor({
    orchestrator = agentOrchestrator,
    responseCache = createResponseCache(),
    embeddingClient = openaiClient,
    redisConfig = getRedisConfig(),
    log = logger,
  } = {}) {
    this.orchestrator = orchestrator;
    this.responseCache = responseCache;
    this.embeddingClient = embeddingClient;
    this.redisConfig = redisConfig;
    this.logger = log;
    this.costOptimizationMetrics = createEmptyCostOptimizationMetrics();
  }

  async streamResponseWithTools(messages, metadata = {}, options = {}) {
    const usage = {};
    const cacheKey = buildResponseCacheKey(messages, metadata);
    const cacheEligible = !hasCacheUnsafeMetadata(metadata);
    const exactCacheResult = await traceCacheOperation('ai_response_cache_lookup', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      cacheName: 'ai_response',
      cacheEligible,
    }, async () => {
      const cachedResponse = cacheEligible
        ? await this.getCachedResponse(cacheKey, metadata)
        : null;

      if (cachedResponse) {
        this.recordCacheHit(cachedResponse.estimatedCostUsd);
      }

      return {
        cacheName: 'ai_response',
        status: cachedResponse ? 'hit' : (cacheEligible ? 'miss' : 'skipped'),
        cachedResponse,
        avoidedLlmCall: Boolean(cachedResponse),
        ...this.getCostOptimizationMetrics(),
      };
    });
    const cachedResponse = exactCacheResult.cachedResponse;

    if (cachedResponse) {
      this.logger.info('CACHE HIT', {
        conversationId: metadata.conversationId,
      });
      await options.onChunk?.(cachedResponse.response);
      return this.handleResponse(cachedResponse.response, messages, metadata, usage, {
        cacheStatus: 'hit',
      });
    }

    this.logger.info('CACHE MISS', {
      conversationId: metadata.conversationId,
      cacheEligible,
    });

    const semanticQuestion = getLatestUserQuestion(messages);
    const semanticLookup = await traceCacheOperation('semantic_response_cache_lookup', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      cacheName: 'semantic_response',
      cacheEligible,
    }, async () => {
      const lookup = cacheEligible
        ? await this.getSemanticCachedResponse(semanticQuestion, metadata)
        : { status: 'skipped', reason: 'cache_ineligible' };

      if (lookup.status === 'hit') {
        this.recordCacheHit(lookup.estimatedCostUsd);
      }

      return {
        cacheName: 'semantic_response',
        ...lookup,
        avoidedLlmCall: lookup.status === 'hit',
        ...this.getCostOptimizationMetrics(),
      };
    });

    if (semanticLookup.status === 'hit') {
      this.logger.info('CACHE HIT', {
        cache: 'semantic_response',
        conversationId: metadata.conversationId,
        similarity: Number(semanticLookup.similarity.toFixed(6)),
      });
      await options.onChunk?.(semanticLookup.response);
      return this.handleResponse(semanticLookup.response, messages, metadata, usage, {
        cacheStatus: 'semantic_hit',
      });
    }

    if (semanticLookup.status === 'miss') {
      this.logger.info('Semantic cache miss', {
        conversationId: metadata.conversationId,
        threshold: this.redisConfig.semanticCacheSimilarityThreshold,
      });
    } else if (semanticLookup.status === 'skipped') {
      this.logger.info('Semantic cache skipped', {
        conversationId: metadata.conversationId,
        reason: semanticLookup.reason,
      });
    }

    this.recordCacheMiss();
    metadata.cacheStatus = cacheEligible ? 'miss' : 'skipped';
    const response = await this.orchestrator.generateResponse(messages, metadata, {
      metadata,
      usage,
      onChunk: options.onChunk,
      signal: options.signal,
    });

    const handledResponse = this.handleResponse(response, messages, metadata, usage, {
      cacheStatus: cacheEligible ? 'miss' : 'skipped',
    });

    if (cacheEligible && !hasCacheUnsafeMetadata(metadata)) {
      await traceCacheOperation('ai_response_cache_write', {
        parentTraceId: metadata.parentTraceId,
        conversationId: metadata.conversationId,
        cacheName: 'ai_response',
      }, async () => {
        const status = await this.setCachedResponse(cacheKey, handledResponse, metadata);
        return {
          cacheName: 'ai_response',
          status,
          writeSucceeded: status === 'write',
          ...this.getCostOptimizationMetrics(),
        };
      });
      await traceCacheOperation('semantic_response_cache_write', {
        parentTraceId: metadata.parentTraceId,
        conversationId: metadata.conversationId,
        cacheName: 'semantic_response',
      }, async () => {
        const status = await this.setSemanticCachedResponse(
          semanticQuestion,
          handledResponse,
          metadata,
          semanticLookup.embedding
        );
        return {
          cacheName: 'semantic_response',
          status,
          writeSucceeded: status === 'write',
          ...this.getCostOptimizationMetrics(),
        };
      });
    }

    return handledResponse;
  }

  async getCachedResponse(cacheKey, metadata = {}) {
    try {
      const cached = await this.responseCache.get(cacheKey);

      if (cached?.response) {
        return cached;
      }
    } catch (error) {
      this.logger.warn('AI response cache lookup failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
    }

    return null;
  }

  async setCachedResponse(cacheKey, response, metadata = {}) {
    try {
      await this.responseCache.set(cacheKey, {
        response,
        promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
        estimatedCostUsd: normalizeEstimatedCost(metadata.openAiUsage?.estimatedCostUsd),
      }, {
        ttlSeconds: this.redisConfig.responseCacheTtlSeconds,
      });
      this.logger.info('AI response cached', {
        conversationId: metadata.conversationId,
        ttlSeconds: this.redisConfig.responseCacheTtlSeconds,
      });
      return 'write';
    } catch (error) {
      this.logger.warn('AI response cache write failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
      return 'skipped';
    }
  }

  async getSemanticCachedResponse(question, metadata = {}) {
    if (!question) {
      return { status: 'skipped', reason: 'missing_question' };
    }

    let embedding;

    try {
      [embedding] = await this.embeddingClient.generateEmbedding([question]);
    } catch (error) {
      this.logger.warn('Semantic cache embedding generation failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
      return { status: 'skipped', reason: 'embedding_failed' };
    }

    try {
      const entries = pruneSemanticEntries(await this.responseCache.get(SEMANTIC_RESPONSE_INDEX_KEY), {
        maxEntries: this.redisConfig.semanticCacheMaxEntries,
      });
      const scope = buildSemanticScope(metadata);
      const threshold = this.redisConfig.semanticCacheSimilarityThreshold;
      let bestMatch = null;

      for (const entry of entries) {
        if (!sameSemanticScope(entry.scope, scope)) {
          continue;
        }

        const similarity = cosineSimilarity(embedding, entry.embedding);

        if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = {
            entry,
            similarity,
          };
        }
      }

      if (bestMatch) {
        return {
          status: 'hit',
          response: bestMatch.entry.response,
          estimatedCostUsd: bestMatch.entry.estimatedCostUsd,
          similarity: bestMatch.similarity,
          embedding,
        };
      }

      return { status: 'miss', embedding };
    } catch (error) {
      this.logger.warn('Semantic cache lookup failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
      return { status: 'skipped', reason: 'cache_lookup_failed', embedding };
    }
  }

  async setSemanticCachedResponse(question, response, metadata = {}, embedding) {
    if (!question || !Array.isArray(embedding)) {
      this.logger.info('Semantic cache skipped', {
        conversationId: metadata.conversationId,
        reason: 'missing_embedding',
      });
      return 'skipped';
    }

    try {
      const now = Date.now();
      const ttlSeconds = this.redisConfig.semanticCacheTtlSeconds;
      const entries = pruneSemanticEntries(await this.responseCache.get(SEMANTIC_RESPONSE_INDEX_KEY), {
        now,
        maxEntries: this.redisConfig.semanticCacheMaxEntries - 1,
      });
      const id = createStableHash({
        question,
        scope: buildSemanticScope(metadata),
        promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
      });
      const nextEntries = [
        {
          id,
          scope: buildSemanticScope(metadata),
          embedding,
          response,
          estimatedCostUsd: normalizeEstimatedCost(metadata.openAiUsage?.estimatedCostUsd),
          promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
          createdAt: now,
          expiresAt: now + (ttlSeconds * 1000),
        },
        ...entries.filter((entry) => entry.id !== id),
      ].slice(0, this.redisConfig.semanticCacheMaxEntries);

      await this.responseCache.set(SEMANTIC_RESPONSE_INDEX_KEY, nextEntries, {
        ttlSeconds,
      });
      this.logger.info('Semantic cache write', {
        conversationId: metadata.conversationId,
        ttlSeconds,
        entryCount: nextEntries.length,
      });
      return 'write';
    } catch (error) {
      this.logger.warn('Semantic cache write failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
      return 'skipped';
    }
  }

  handleResponse(response, messages, metadata = {}, usage = {}, cacheMetadata = {}) {
    if (!response) {
      this.logger.error('No response from OpenAI', {
        ip: metadata.clientIP,
        conversationId: metadata.conversationId,
      });
      throw new HttpError(502, 'No response from AI provider', { code: 'AI_EMPTY_RESPONSE' });
    }

    this.logger.info('Chat response generated', {
      ip: metadata.clientIP,
      conversationId: metadata.conversationId,
      promptVersion: metadata.promptVersion || CHAT_SYSTEM_PROMPT_VERSION,
      promptMessageCount: messages.length,
      responseLength: response.length,
      cacheStatus: cacheMetadata.cacheStatus,
      promptTokens: usage.openAiUsage?.promptTokens || 0,
      completionTokens: usage.openAiUsage?.completionTokens || 0,
      totalTokens: usage.openAiUsage?.totalTokens || 0,
      estimatedCostUsd: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostUsd
        : null,
      estimatedCost: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostDisplay
        : null,
    });

    this.logger.info('OpenAI token usage for conversation', {
      conversationId: metadata.conversationId,
      promptTokens: usage.openAiUsage?.promptTokens || 0,
      completionTokens: usage.openAiUsage?.completionTokens || 0,
      estimatedCost: usage.openAiUsage?.hasEstimatedCost
        ? usage.openAiUsage.estimatedCostDisplay
        : null,
    });

    metadata.openAiUsage = usage.openAiUsage || null;
    metadata.cacheStatus = cacheMetadata.cacheStatus || 'not_applicable';

    return response;
  }

  recordCacheHit(estimatedSavingsUsd = 0) {
    this.costOptimizationMetrics.cacheHits += 1;
    this.costOptimizationMetrics.estimatedSavingsUsd = Number((
      this.costOptimizationMetrics.estimatedSavingsUsd + normalizeEstimatedCost(estimatedSavingsUsd)
    ).toFixed(6));
    this.logCostOptimizationMetrics();
  }

  recordCacheMiss() {
    this.costOptimizationMetrics.cacheMisses += 1;
    this.logCostOptimizationMetrics();
  }

  getCostOptimizationMetrics() {
    const { cacheHits, cacheMisses, estimatedSavingsUsd } = this.costOptimizationMetrics;

    return {
      cacheHits,
      cacheMisses,
      cacheHitRate: formatPercent(cacheHits, cacheHits + cacheMisses),
      estimatedSavings: formatCurrency(estimatedSavingsUsd),
    };
  }

  logCostOptimizationMetrics() {
    this.logger.info('Cost optimization metrics updated', this.getCostOptimizationMetrics());
  }
}

export {
  OpenAIService,
  buildResponseCacheKey,
  cosineSimilarity,
  createEmptyCostOptimizationMetrics,
  formatCurrency,
  formatPercent,
  getLatestUserQuestion,
  hasCacheUnsafeMetadata,
  normalizeEstimatedCost,
  pruneSemanticEntries,
};
export default new OpenAIService();
