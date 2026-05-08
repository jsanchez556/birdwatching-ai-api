import openaiClient from '../ai/openai.client.js';
import embeddingsService from './embeddings.service.js';
import vectorSearchService from './vectorSearch.service.js';
import logger from '../utils/logger.js';

const DEFAULT_TOP_K = 3;

function formatScore(score) {
  return Number.isFinite(score) ? Number(score.toFixed(4)) : 0;
}

function formatRetrievedContext(documents) {
  return documents
    .map((document, index) => [
      `${index + 1}. ${document.name}`,
      `Similarity score: ${formatScore(document.score)}`,
      `Locations: ${document.locations || 'Unknown'}`,
      `Description: ${document.description}`,
    ].join('\n'))
    .join('\n\n');
}

function toKnowledgeSource(document) {
  return {
    name: document.name,
    location: document.locations || 'Unknown',
    similarityScore: formatScore(document.score),
  };
}

class RagService {
  async retrieveContext(question, options = {}) {
    const topK = options.topK || DEFAULT_TOP_K;
    const [queryEmbedding] = await openaiClient.generateEmbedding([question]);
    const documents = await embeddingsService.searchSimilarDocuments();

    return vectorSearchService.search(queryEmbedding, documents, topK);
  }

  async buildContext(messages, question, metadata = {}) {
    try {
      const documents = await this.retrieveContext(question, metadata);

      if (documents.length === 0) {
        logger.info('No RAG documents retrieved for chat', {
          conversationId: metadata.conversationId,
          topK: metadata.topK || DEFAULT_TOP_K,
        });
        return {
          messages,
          sources: [],
        };
      }

      const sources = documents.map(toKnowledgeSource);

      const contextMessage = {
        role: 'system',
        content: [
          'Use this retrieved Costa Rica bird knowledge when it is relevant to the user question.',
          'Do not claim the context contains information that is not present.',
          '',
          formatRetrievedContext(documents),
        ].join('\n'),
      };

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

      return {
        messages: [
          messages[0],
          contextMessage,
          ...messages.slice(1),
        ],
        sources,
      };
    } catch (error) {
      logger.warn('Failed to retrieve RAG context; continuing without it', {
        conversationId: metadata.conversationId,
        error: error.message,
      });

      return {
        messages,
        sources: [],
      };
    }
  }
}

export { formatRetrievedContext, formatScore, toKnowledgeSource };
export default new RagService();
