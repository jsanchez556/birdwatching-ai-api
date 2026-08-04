import logger from '../utils/logger.js';
import retrievalService from '../ai/services/retrieval.service.js';
import vectorRepository from '../db/repositories/vector/vector.repository.js';
import { injectRagContextMessage } from '../ai/prompts/prompt.builder.js';
import { toKnowledgeSource } from '../ai/prompts/rag.context.js';
import { traceCacheOperation, traceRagPipeline, traceRagRetrieval } from '../tracing/aiTracing.middleware.js';
import aiTelemetry from '../monitoring/aiTelemetry.js';
import createRetrievalCache from '../cache/retrievalCache.js';
import { getRedisConfig } from '../cache/redisClient.js';
import featureFlags from '../featureFlags/featureFlag.service.js';
import { FEATURE_FLAGS, RETRIEVAL_VARIANTS } from '../featureFlags/flags.js';
import { buildRetrievalCacheKey } from './rag/queryNormalization.js';
import {
  buildGroundingTrace,
  summarizeRetrievedChunk,
  summarizeRetrievedChunks,
} from './rag/contextAssembly.js';
import {
  buildBirdMatches,
  getSupplementalBirdFamily,
  mergeRetrievedDocuments,
  normalizeBirdMatch,
} from './rag/retrievalFiltering.js';
import ragContextSelector from './rag/contextSelection.js';
import {
  UNAVAILABLE_CAPABILITIES,
  classifyCapabilityFailure,
  markCapabilityUnavailable,
} from '../utils/degradation.utils.js';

const DEFAULT_TOP_K = 3;
const DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT = 8;
const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 1;
const ADVANCED_RETRIEVAL_OPTIONS = Object.freeze({
  candidateMultiplier: 6,
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  maxChunksPerDocument: 2,
});
class RagService {
  constructor({
    retriever = retrievalService,
    retrievalCache = createRetrievalCache(),
    redisConfig = getRedisConfig(),
    featureFlagService = featureFlags,
    contextSelector = ragContextSelector,
    log = logger,
  } = {}) {
    this.retriever = retriever;
    this.retrievalCache = retrievalCache;
    this.redisConfig = redisConfig;
    this.featureFlags = featureFlagService;
    this.contextSelector = contextSelector;
    this.logger = log;
  }

  async getBirdProfile({ speciesCode, name } = {}) {
    const document = await vectorRepository.findBirdProfile({ speciesCode, name });

    return normalizeBirdMatch(document);
  }

  async retrieveContext(question, options = {}) {
    const topK = options.topK || DEFAULT_TOP_K;
    const filters = {
      ...(options.filters || {}),
      ...(options.category ? { category: options.category } : {}),
      ...(options.location ? { location: options.location } : {}),
      ...(options.title ? { title: options.title } : {}),
    };
    const retrievalOptions = {
      topK,
      filters,
      minScore: options.minScore,
      minSemanticScore: options.minSemanticScore,
      maxChunksPerDocument: options.maxChunksPerDocument,
      ...(options.candidateMultiplier === undefined
        ? {} : { candidateMultiplier: options.candidateMultiplier }),
      ...(options.semanticWeight === undefined
        ? {} : { semanticWeight: options.semanticWeight }),
      ...(options.keywordWeight === undefined
        ? {} : { keywordWeight: options.keywordWeight }),
      userId: options.userId,
      tenantId: options.tenantId,
      role: options.role,
      parentTraceId: options.parentTraceId,
      aiTraceId: options.aiTraceId,
      ragTokenBudget: options.ragTokenBudget,
      maxChunkTokens: options.maxChunkTokens,
      nearDuplicateThreshold: options.nearDuplicateThreshold,
    };
    const cacheKey = buildRetrievalCacheKey(question, retrievalOptions);
    const cacheLookup = await traceCacheOperation('rag_retrieval_cache_lookup', {
      parentTraceId: options.parentTraceId,
      conversationId: options.conversationId,
      cacheName: 'rag_retrieval',
      topK,
      aiTraceId: options.aiTraceId,
    }, async () => {
      const cachedDocuments = await this.getCachedRetrieval(cacheKey, options);

      return {
        cacheName: 'rag_retrieval',
        status: cachedDocuments ? 'hit' : 'miss',
        cachedDocuments,
        avoidedLlmCall: Boolean(cachedDocuments),
      };
    });
    const cachedDocuments = cacheLookup.cachedDocuments;

    if (cachedDocuments) {
      this.logger.info('CACHE HIT', {
        cache: 'rag_retrieval',
        conversationId: options.conversationId,
      });
      return cachedDocuments;
    }

    this.logger.info('CACHE MISS', {
      cache: 'rag_retrieval',
      conversationId: options.conversationId,
    });

    const documents = await traceRagRetrieval('chat_rag_retrieval', {
      parentTraceId: options.parentTraceId,
      conversationId: options.conversationId,
      queryLength: question?.length || 0,
      topK,
      filters,
      aiTraceId: options.aiTraceId,
    }, () => this.retriever.retrieve(question, retrievalOptions));

    await traceCacheOperation('rag_retrieval_cache_write', {
      parentTraceId: options.parentTraceId,
      conversationId: options.conversationId,
      cacheName: 'rag_retrieval',
      topK,
      aiTraceId: options.aiTraceId,
    }, async () => {
      const status = await this.setCachedRetrieval(cacheKey, documents, options);

      return {
        cacheName: 'rag_retrieval',
        status,
        writeSucceeded: status === 'write',
      };
    });

    return documents;
  }

  async getCachedRetrieval(cacheKey, metadata = {}) {
    try {
      const cached = await this.retrievalCache.get(cacheKey);

      if (Array.isArray(cached)) {
        return cached;
      }
    } catch (error) {
      this.logger.warn('RAG retrieval cache lookup failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
    }

    return null;
  }

  async setCachedRetrieval(cacheKey, documents, metadata = {}) {
    try {
      await this.retrievalCache.set(cacheKey, documents, {
        ttlSeconds: this.redisConfig.retrievalCacheTtlSeconds,
      });
      return 'write';
    } catch (error) {
      this.logger.warn('RAG retrieval cache write failed', {
        conversationId: metadata.conversationId,
        error: error.message,
      });
      return 'skipped';
    }
  }

  async buildContext(messages, question, metadata = {}) {
    const result = await traceRagPipeline('chat_rag_pipeline', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      queryLength: question?.length || 0,
      inputMessageCount: Array.isArray(messages) ? messages.length : 0,
      topK: metadata.topK || DEFAULT_TOP_K,
      aiTraceId: metadata.aiTraceId,
    }, async () => this.buildContextUntraced(messages, question, metadata), {
      outputMetadata: (result) => result.ragTrace || {
        retrievedChunkCount: 0,
        sourceCount: 0,
        groundedMessageCount: result.messages?.length || 0,
      },
    });
    return result;
  }

  async buildContextUntraced(messages, question, metadata = {}) {
    let retrievalVariant = RETRIEVAL_VARIANTS.CURRENT;

    try {
      const evaluatedVariant = await this.featureFlags.getVariant({
        flag: FEATURE_FLAGS.ADVANCED_RAG,
        userId: metadata.userId,
        tenantId: metadata.tenantId,
        anonymousId: metadata.conversationId,
        personProperties: {
          plan: metadata.authUser?.plan,
          role: metadata.role,
        },
        defaultValue: RETRIEVAL_VARIANTS.CURRENT,
      });
      retrievalVariant = evaluatedVariant === RETRIEVAL_VARIANTS.NEW
        ? RETRIEVAL_VARIANTS.NEW
        : RETRIEVAL_VARIANTS.CURRENT;
      const retrievalMetadata = {
        ...metadata,
        retrievalVariant,
        ...(retrievalVariant === RETRIEVAL_VARIANTS.NEW ? ADVANCED_RETRIEVAL_OPTIONS : {}),
      };
      let documents = await this.retrieveContext(question, retrievalMetadata);
      const supplementalFamily = getSupplementalBirdFamily(documents, question);

      if (supplementalFamily && documents.length < DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT) {
        const supplementalDocuments = await this.retrieveContext(question, {
          ...retrievalMetadata,
          topK: DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT,
          category: supplementalFamily,
        });

        documents = mergeRetrievedDocuments(documents, supplementalDocuments);
      }

      const upstreamCandidateCount = documents.reduce((total, document) => (
        total + Number(document.selectionReport?.candidateCount || 0)
      ), 0);
      const finalSelection = this.contextSelector.select(documents, question, {
        filters: retrievalMetadata.filters,
        userId: metadata.userId,
        role: metadata.role,
        resultLimit: supplementalFamily
          ? Math.max(metadata.topK || DEFAULT_TOP_K, DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT)
          : metadata.topK || DEFAULT_TOP_K,
        tokenBudget: metadata.ragTokenBudget,
        maxChunkTokens: metadata.maxChunkTokens,
        nearDuplicateThreshold: metadata.nearDuplicateThreshold,
        maxChunksPerDocument: retrievalMetadata.maxChunksPerDocument
          ?? DEFAULT_MAX_CHUNKS_PER_DOCUMENT,
      });
      documents = finalSelection.documents.map((document, index) => ({
        ...document,
        ...(index === 0 ? {
          selectionReport: {
            ...finalSelection.report,
            upstreamCandidateCount: upstreamCandidateCount || documents.length,
          },
        } : {}),
      }));

      const retrievedChunks = summarizeRetrievedChunks(documents);

      this.logger.info('RAG retrieved chunks for chat', {
        event: 'rag_retrieved_chunks',
        conversationId: metadata.conversationId,
        chunkCount: documents.length,
        chunks: retrievedChunks,
      });

      if (documents.length === 0) {
        this.logger.info('No RAG documents retrieved for chat', {
          conversationId: metadata.conversationId,
          topK: metadata.topK || DEFAULT_TOP_K,
        });
        return {
          messages,
          sources: [],
          birdMatches: [],
          ragTrace: {
            ...buildGroundingTrace({
              documents: [],
              sources: [],
              promptMessages: messages,
              originalMessageCount: messages.length,
            }),
            retrievalVariant,
          },
        };
      }

      const sources = documents.map(toKnowledgeSource);
      const birdMatches = buildBirdMatches(documents, question);
      const groundedMessages = injectRagContextMessage(messages, documents);
      const ragTrace = buildGroundingTrace({
        documents,
        sources,
        promptMessages: groundedMessages,
        originalMessageCount: messages.length,
      });
      ragTrace.retrievalVariant = retrievalVariant;

      this.logger.info('RAG context retrieved for chat', {
        conversationId: metadata.conversationId,
        documentCount: documents.length,
        topK: metadata.topK || DEFAULT_TOP_K,
        results: sources.map((source) => ({
          name: source.name,
          location: source.location,
          similarityScore: source.similarityScore,
        })),
      });

      this.logger.info('RAG grounding context assembled for chat', {
        event: 'rag_grounding_context_assembled',
        conversationId: metadata.conversationId,
        retrievedChunkCount: ragTrace.retrievedChunkCount,
        sourceCount: ragTrace.sourceCount,
        contextMessageLength: ragTrace.contextMessageLength,
        groundedMessageCount: ragTrace.groundedMessageCount,
      });

      return {
        messages: groundedMessages,
        sources,
        birdMatches,
        ragTrace,
      };
    } catch (error) {
      const degradation = {};
      const classification = classifyCapabilityFailure(error).classification;
      aiTelemetry.recordAiError('retrieval_failed', {
        capability: UNAVAILABLE_CAPABILITIES.RAG_RECOMMENDATIONS,
        classification,
        conversationId: metadata.conversationId,
        userId: metadata.userId,
        aiTraceId: metadata.aiTraceId,
        queryLength: question?.length || 0,
        topK: metadata.topK || DEFAULT_TOP_K,
      });
      markCapabilityUnavailable(
        degradation,
        UNAVAILABLE_CAPABILITIES.RAG_RECOMMENDATIONS,
        error,
        {
          context: {
            aiTraceId: metadata.aiTraceId,
            traceId: metadata.parentTraceId,
          },
          record: false,
        }
      );

      return {
        messages,
        sources: [],
        birdMatches: [],
        ...degradation,
        ragTrace: {
          retrievedChunkCount: 0,
          sourceCount: 0,
          groundedMessageCount: messages.length,
          error: 'rag_retrieval_failed',
          retrievalVariant,
        },
      };
    }
  }
}

export {
  buildRetrievalCacheKey,
  RagService,
  buildGroundingTrace,
  summarizeRetrievedChunk,
  summarizeRetrievedChunks,
};
export default new RagService();
