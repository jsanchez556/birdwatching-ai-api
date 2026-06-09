import crypto from 'crypto';
import openaiClient from '../../openai.client.js';
import {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
} from './embeddings.service.js';
import { normalizeTextOrEmpty } from '../../../utils/normalizer.utils.js'
import logger from '../../../utils/logger.js';
import chunkingService from './chunking.service.js';
import vectorRepository from '../../../db/vector/vector.repository.js';

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
  validateNormalizedDocument,
};
export default new IngestService();
