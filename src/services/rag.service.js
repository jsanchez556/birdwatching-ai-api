import logger from '../utils/logger.js';
import retrievalService from '../db/retrieval/retrieval.service.js';
import vectorRepository from '../db/vector/vector.repository.js';
import { injectRagContextMessage } from '../ai/prompts/prompt.builder.js';
import { toKnowledgeSource } from '../ai/prompts/rag.context.js';
import { traceRagPipeline, traceRagRetrieval } from '../tracing/aiTracing.middleware.js';
import aiTelemetry from '../monitoring/aiTelemetry.js';

const DEFAULT_TOP_K = 3;
const DEFAULT_BIRD_MATCH_LIMIT = 6;
const DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT = 8;
const FIELD_MATCH_WEIGHTS = {
  commonName: 500,
  scientificName: 400,
  family: 250,
  description: 150,
  location: 40,
  speciesCode: 10,
};
const QUESTION_STOP_WORDS = new Set([
  'about',
  'bird',
  'birds',
  'can',
  'could',
  'find',
  'for',
  'from',
  'give',
  'i',
  'in',
  'info',
  'information',
  'me',
  'near',
  'of',
  'on',
  'please',
  'see',
  'show',
  'tell',
  'the',
  'to',
  'what',
  'where',
  'with',
]);

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Number(score.toFixed(6)) : undefined;
}

function summarizeRetrievedChunk(document = {}, index = 0) {
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
    textLength: document.text?.length || document.description?.length || 0,
  });
}

function summarizeRetrievedChunks(documents = []) {
  return documents.map(summarizeRetrievedChunk);
}

function buildGroundingTrace({
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
    sources: sources.map((source, index) => compactObject({
      index,
      name: source.name,
      location: source.location,
      similarityScore: normalizeScore(source.similarityScore),
    })),
  };
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => hasValue(entryValue))
  );
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeToken(token) {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function tokenizeQuestion(question) {
  const normalized = normalizeSearchText(question);

  if (!normalized) {
    return [];
  }

  return [...new Set(normalized
    .split(/\s+/)
    .map(singularizeToken)
    .filter((token) => token.length > 2)
    .filter((token) => !QUESTION_STOP_WORDS.has(token)))];
}

function fieldIncludesQuery(fieldValue, queryText) {
  const fieldText = normalizeSearchText(fieldValue);

  return Boolean(fieldText && queryText && fieldText.includes(queryText));
}

function countTokenMatches(fieldValue, queryTokens) {
  const fieldTokens = new Set(
    normalizeSearchText(fieldValue)
      .split(/\s+/)
      .filter(Boolean)
      .map(singularizeToken)
  );

  return queryTokens.filter((token) => fieldTokens.has(token)).length;
}

function scoreFieldMatch(fieldValue, questionText, questionTokens, weight) {
  if (!fieldValue) {
    return 0;
  }

  const exactPhraseScore = fieldIncludesQuery(fieldValue, questionText) ? weight : 0;
  const tokenScore = countTokenMatches(fieldValue, questionTokens) * Math.round(weight / 4);

  return exactPhraseScore + tokenScore;
}

function scoreBirdMatch(document, question) {
  const metadata = document.metadata || {};
  const questionText = normalizeSearchText(question);
  const questionTokens = tokenizeQuestion(question);

  if (!questionText || questionTokens.length === 0) {
    return {
      score: Number(document.score) || 0,
      identityScore: 0,
      hasIdentityMatch: false,
      mediaPriority: scoreBirdMedia(metadata.media),
    };
  }

  const commonName = metadata.commonName || document.name;
  const scientificName = metadata.scientificName;
  const family = metadata.familyCommonName || document.category;
  const speciesCode = metadata.speciesCode;
  const description = document.description || metadata.description;
  const locations = document.locations === 'Unknown' ? '' : document.locations || metadata.locations;

  const identityScore = (
    scoreFieldMatch(commonName, questionText, questionTokens, FIELD_MATCH_WEIGHTS.commonName)
    + scoreFieldMatch(scientificName, questionText, questionTokens, FIELD_MATCH_WEIGHTS.scientificName)
    + scoreFieldMatch(family, questionText, questionTokens, FIELD_MATCH_WEIGHTS.family)
    + scoreFieldMatch(speciesCode, questionText, questionTokens, FIELD_MATCH_WEIGHTS.speciesCode)
  );
  const contextualScore = (
    scoreFieldMatch(description, questionText, questionTokens, FIELD_MATCH_WEIGHTS.description)
    + scoreFieldMatch(locations, questionText, questionTokens, FIELD_MATCH_WEIGHTS.location)
  );

  return {
    score: identityScore + contextualScore + (Number(document.score) || 0),
    identityScore,
    hasIdentityMatch: identityScore > 0,
    mediaPriority: scoreBirdMedia(metadata.media),
  };
}

function getBirdIdentityKey(document) {
  const metadata = document.metadata || {};

  return metadata.speciesCode || document.id || document.documentId || metadata.commonName || document.name;
}

function getBirdFamily(document) {
  const metadata = document.metadata || {};

  return metadata.familyCommonName || document.category;
}

function hasFamilyMatch(document, question) {
  const family = getBirdFamily(document);
  const questionText = normalizeSearchText(question);
  const questionTokens = tokenizeQuestion(question);

  return scoreFieldMatch(family, questionText, questionTokens, FIELD_MATCH_WEIGHTS.family) > 0;
}

function mergeDocuments(primaryDocuments = [], supplementalDocuments = []) {
  const merged = [];
  const seen = new Set();

  for (const document of [...primaryDocuments, ...supplementalDocuments]) {
    const key = getBirdIdentityKey(document);

    if (key && seen.has(key)) {
      continue;
    }

    if (key) {
      seen.add(key);
    }

    merged.push(document);
  }

  return merged;
}

function getSupplementalBirdFamily(documents = [], question = '') {
  const familyCounts = new Map();

  for (const document of documents) {
    if (document?.documentType !== 'bird_profile' || !hasFamilyMatch(document, question)) {
      continue;
    }

    const family = getBirdFamily(document);

    if (!family) {
      continue;
    }

    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }

  return [...familyCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .at(0)?.[0];
}

function normalizeBirdMedia(media = {}) {
  if (!media || typeof media !== 'object') {
    return {};
  }

  return compactObject({
    photoUrl: media.photoUrl,
    squarePhotoUrl: media.squarePhotoUrl,
    photoAttribution: media.photoAttribution,
    wikiTitle: media.wikiTitle,
    songUrl: media.songUrl,
    sonogramUrl: media.sonogramUrl,
    songLength: media.songLength,
    songAttributionHtml: media.songAttributionHtml,
  });
}

function hasBirdImage(media = {}) {
  return Boolean(media?.photoUrl || media?.squarePhotoUrl);
}

function hasBirdSound(media = {}) {
  return Boolean(media?.songUrl);
}

function scoreBirdMedia(media = {}) {
  const hasImage = hasBirdImage(media);
  const hasSound = hasBirdSound(media);

  if (hasImage && hasSound) {
    return 4;
  }

  if (hasImage) {
    return 3;
  }

  if (hasSound) {
    return 2;
  }

  return 1;
}

function normalizeBirdMatch(document) {
  if (document?.documentType !== 'bird_profile') {
    return null;
  }

  const metadata = document.metadata || {};
  const media = normalizeBirdMedia(metadata.media);
  const match = compactObject({
    speciesCode: metadata.speciesCode,
    commonName: metadata.commonName || document.name,
    scientificName: metadata.scientificName,
    family: metadata.familyCommonName || document.category,
    description: document.description,
    locations: document.locations === 'Unknown' ? undefined : document.locations,
    lastObservation: metadata.lastObservation,
    ...(Object.keys(media).length ? { media } : {}),
  });

  return Object.keys(match).length ? match : null;
}

function buildBirdMatches(documents = [], question = '', limit = DEFAULT_BIRD_MATCH_LIMIT) {
  const matches = [];
  const seen = new Set();
  const rankedDocuments = documents
    .filter((document) => document?.documentType === 'bird_profile')
    .map((document, index) => ({
      document,
      index,
      ...scoreBirdMatch(document, question),
    }));
  const hasIdentityMatches = rankedDocuments.some((candidate) => candidate.hasIdentityMatch);

  rankedDocuments.sort((left, right) => (
    Number(right.hasIdentityMatch) - Number(left.hasIdentityMatch)
    || right.identityScore - left.identityScore
    || right.mediaPriority - left.mediaPriority
    || right.score - left.score
    || left.index - right.index
  ));

  for (const { document, hasIdentityMatch } of rankedDocuments) {
    if (hasIdentityMatches && !hasIdentityMatch) {
      continue;
    }

    const match = normalizeBirdMatch(document);

    if (!match) {
      continue;
    }

    const key = getBirdIdentityKey(document) || match.speciesCode || match.commonName;

    if (key && seen.has(key)) {
      continue;
    }

    if (key) {
      seen.add(key);
    }

    matches.push(match);

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

class RagService {
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

    return traceRagRetrieval('chat_rag_retrieval', {
      parentTraceId: options.parentTraceId,
      conversationId: options.conversationId,
      queryLength: question?.length || 0,
      topK,
      filters,
    }, () => retrievalService.retrieve(question, {
      topK,
      filters,
      minScore: options.minScore,
      minSemanticScore: options.minSemanticScore,
      maxChunksPerDocument: options.maxChunksPerDocument,
    }));
  }

  async buildContext(messages, question, metadata = {}) {
    return traceRagPipeline('chat_rag_pipeline', {
      parentTraceId: metadata.parentTraceId,
      conversationId: metadata.conversationId,
      queryLength: question?.length || 0,
      inputMessageCount: Array.isArray(messages) ? messages.length : 0,
      topK: metadata.topK || DEFAULT_TOP_K,
    }, async () => this.buildContextUntraced(messages, question, metadata), {
      outputMetadata: (result) => result.ragTrace || {
        retrievedChunkCount: 0,
        sourceCount: 0,
        groundedMessageCount: result.messages?.length || 0,
      },
    });
  }

  async buildContextUntraced(messages, question, metadata = {}) {
    try {
      let documents = await this.retrieveContext(question, metadata);
      const supplementalFamily = getSupplementalBirdFamily(documents, question);

      if (supplementalFamily && documents.length < DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT) {
        const supplementalDocuments = await this.retrieveContext(question, {
          ...metadata,
          topK: DEFAULT_BIRD_MATCH_CANDIDATE_LIMIT,
          category: supplementalFamily,
        });

        documents = mergeDocuments(documents, supplementalDocuments);
      }

      const retrievedChunks = summarizeRetrievedChunks(documents);

      logger.info('RAG retrieved chunks for chat', {
        event: 'rag_retrieved_chunks',
        conversationId: metadata.conversationId,
        chunkCount: documents.length,
        chunks: retrievedChunks,
      });

      if (documents.length === 0) {
        logger.info('No RAG documents retrieved for chat', {
          conversationId: metadata.conversationId,
          topK: metadata.topK || DEFAULT_TOP_K,
        });
        return {
          messages,
          sources: [],
          birdMatches: [],
          ragTrace: buildGroundingTrace({
            documents: [],
            sources: [],
            promptMessages: messages,
            originalMessageCount: messages.length,
          }),
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

      logger.info('RAG context retrieved for chat', {
        conversationId: metadata.conversationId,
        documentCount: documents.length,
        topK: metadata.topK || DEFAULT_TOP_K,
        results: sources.map((source) => ({
          name: source.name,
          location: source.location,
          similarityScore: source.similarityScore,
        })),
      });

      logger.info('RAG grounding context assembled for chat', {
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
      aiTelemetry.recordAiError('retrieval_failed', {
        conversationId: metadata.conversationId,
        queryLength: question?.length || 0,
        topK: metadata.topK || DEFAULT_TOP_K,
        error: {
          name: error.name,
          code: error.code,
          status: error.status,
          message: error.message,
        },
      });
      logger.warn('Failed to retrieve RAG context; continuing without it', {
        conversationId: metadata.conversationId,
        error: error.message,
      });

      return {
        messages,
        sources: [],
        birdMatches: [],
        ragTrace: {
          retrievedChunkCount: 0,
          sourceCount: 0,
          groundedMessageCount: messages.length,
          error: 'rag_retrieval_failed',
        },
      };
    }
  }
}

export {
  buildGroundingTrace,
  summarizeRetrievedChunk,
  summarizeRetrievedChunks,
};
export default new RagService();
