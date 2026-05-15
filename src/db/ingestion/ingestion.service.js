import crypto from 'crypto';
import openaiClient from '../../ai/openai.client.js';
import {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
} from '../../services/embeddings.service.js';
import logger from '../../utils/logger.js';
import chunkingService from '../chunking/chunking.service.js';
import vectorRepository from '../vector/vector.repository.js';

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizeDocument(document, index = 0, defaults = {}) {
  const title = document.name || document.title || `Knowledge document ${index + 1}`;
  const locations = normalizeLocations(document);
  const content = document.content || document.text || documentToText({
    ...document,
    name: title,
    location: locations,
  });
  const metadata = {
    family: document.family,
    locations,
    description: document.description,
    ...(document.metadata || {}),
  };

  return {
    externalId: String(document.id || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `knowledge-document-${index + 1}`,
    title,
    content,
    source: document.source || defaults.source || 'knowledge',
    documentType: document.documentType
      || document.type
      || defaults.documentType
      || (document.family ? 'bird_profile' : 'knowledge_document'),
    category: document.category || document.family || null,
    locale: document.locale || 'en-CR',
    tags: document.tags || [document.family, ...String(locations || '').split(',')],
    metadata,
    active: document.active !== false,
  };
}

class IngestionService {
  async ingestDocuments(rawDocuments, options = {}) {
    await vectorRepository.initializeSchema();

    const documents = normalizeKnowledgeBase(rawDocuments)
      .filter((document) => (
        (document?.name || document?.title)
        && (document?.description || document?.content || document?.text)
      ))
      .map((document, index) => normalizeDocument(document, index, {
        source: options.source,
        documentType: options.documentType,
      }));

    let chunkCount = 0;
    let skippedCount = 0;

    for (const document of documents) {
      const contentHash = hashContent(JSON.stringify({
        content: document.content,
        metadata: document.metadata,
      }));
      const existingDocument = await vectorRepository.findDocumentByExternalId(document.externalId);

      if (!options.force && existingDocument?.content_hash === contentHash) {
        skippedCount += 1;
        continue;
      }

      const savedDocument = await vectorRepository.upsertDocument({
        ...document,
        contentHash,
      });
      const chunks = chunkingService.chunkText(document.content, {
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        metadata: document.metadata,
      });

      if (chunks.length === 0) {
        continue;
      }

      const embeddings = await openaiClient.generateEmbedding(chunks.map((chunk) => chunk.content));
      const embeddedChunks = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      }));

      await vectorRepository.replaceDocumentChunks(savedDocument.id, embeddedChunks);
      chunkCount += embeddedChunks.length;
    }

    logger.info('Knowledge documents ingested into vector store', {
      documentCount: documents.length,
      chunkCount,
      skippedCount,
    });

    return {
      documentCount: documents.length,
      chunkCount,
      skippedCount,
    };
  }
}

export {
  hashContent,
  normalizeDocument,
};
export default new IngestionService();
