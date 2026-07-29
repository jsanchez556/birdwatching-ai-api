import crypto from 'crypto';
import {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
} from '../../ai/services/embeddings.service.js';
import { normalizeTextOrEmpty } from '../../utils/normalizer.utils.js'
import logger from '../../utils/logger.js';
import chunkingService from '../../ai/services/chunking.service.js';
import vectorRepository from '../../db/vector/vector.repository.js';
import embeddingJobService from '../../ai/services/embeddingJob.service.js';

const REQUIRED_DOCUMENT_FIELDS = ['externalId', 'name'];

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function validateNormalizedDocument(document, index = 0) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`Invalid normalized document at index ${index}: expected an object`);
  }

  const missingFields = REQUIRED_DOCUMENT_FIELDS.filter((field) => !normalizeTextOrEmpty(document[field]));

  if (missingFields.length > 0) {
    throw new Error(`Invalid normalized document at index ${index}: missing ${missingFields.join(', ')}`);
  }
}

function normalizeDocument(document, index = 0, defaults = {}) {
  validateNormalizedDocument(document, index);
  const title = normalizeTextOrEmpty(document.name);
  const locations = normalizeLocations(document);
  const content = documentToText({
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
  const externalId = normalizeTextOrEmpty(document.externalId);

  return {
    externalId,
    title,
    content,
    source: document.source || defaults.source || 'knowledge',
    documentType: document.documentType
      || defaults.documentType
      || 'knowledge_document',
    category: document.category || document.family || null,
    locale: document.locale || 'en-CR',
    tags: Array.isArray(document.tags) ? document.tags : [],
    metadata,
    active: document.active !== false,
  };
}

class IngestService {
  async ingestDocuments(rawDocuments, options = {}) {
    await vectorRepository.initializeSchema();

    const documents = normalizeKnowledgeBase(rawDocuments)
      .map((document, index) => normalizeDocument(document, index, {
        source: options.source,
        documentType: options.documentType,
      }));

    let chunkCount = 0;
    let queuedCount = 0;
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

      await embeddingJobService.enqueueDocumentEmbedding({
        documentId: savedDocument.id,
        contentHash,
      });
      queuedCount += 1;
      chunkCount += chunks.length;
    }

    logger.info('Knowledge documents queued for vector embedding', {
      documentCount: documents.length,
      chunkCount,
      queuedCount,
      skippedCount,
    });

    return {
      documentCount: documents.length,
      chunkCount,
      queuedCount,
      skippedCount,
    };
  }
}

export {
  hashContent,
  normalizeDocument,
  validateNormalizedDocument,
};
export default new IngestService();
