import openaiClient from '../ai/openai.client.js';
import embeddingsService from './embeddings.service.js';
import vectorSearchService from './vectorSearch.service.js';
import logger from '../utils/logger.js';
import { injectRagContextMessage } from '../ai/prompts/prompt.builder.js';
import {
  formatRetrievedContext,
  formatScore,
  toKnowledgeSource,
} from '../ai/prompts/rag.context.js';

const DEFAULT_TOP_K = 3;

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
        messages: injectRagContextMessage(messages, documents),
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
