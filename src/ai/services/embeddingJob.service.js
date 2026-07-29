import { randomUUID } from 'crypto';
import openaiClient from '../clients/openai.client.js';
import chunkingService from './chunking.service.js';
import vectorRepository from '../../db/vector/vector.repository.js';
import { JOB_STATUSES, JOB_TYPES } from '../../jobs/jobTypes.js';
import { registerEmbeddingQueue } from '../../queues/embedding.queue.js';
import logger from '../../utils/logger.js';

function normalizeDocumentId(documentId) {
  const normalized = Number(documentId);

  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error('documentId must be a positive integer');
  }

  return normalized;
}

function buildEmbeddingJobId({ documentId, contentHash }) {
  const suffix = String(contentHash || randomUUID())
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 24);

  return `embedding-${documentId}-${suffix}`;
}

function mapRowToDocument(row = {}) {
  return {
    id: row.id,
    content: row.content,
    metadata: row.metadata || {},
    contentHash: row.content_hash,
  };
}

class EmbeddingJobService {
  constructor({
    queueFactory = registerEmbeddingQueue,
    repository = vectorRepository,
    embeddingClient = openaiClient,
    chunker = chunkingService,
    logger: serviceLogger = logger,
  } = {}) {
    this.queueFactory = queueFactory;
    this.repository = repository;
    this.embeddingClient = embeddingClient;
    this.chunker = chunker;
    this.logger = serviceLogger;
  }

  async enqueueDocumentEmbedding({ documentId, contentHash } = {}) {
    const normalizedDocumentId = normalizeDocumentId(documentId);
    const jobId = buildEmbeddingJobId({
      documentId: normalizedDocumentId,
      contentHash,
    });
    const queue = this.queueFactory();

    await queue.add(JOB_TYPES.EMBEDDING, {
      documentId: normalizedDocumentId,
    }, {
      jobId,
    });

    this.logger.info('Embedding job queued', {
      event: 'embedding_job_queued',
      jobId,
      documentId: normalizedDocumentId,
    });

    return {
      jobId,
      status: JOB_STATUSES.QUEUED,
      documentId: normalizedDocumentId,
    };
  }

  async processDocumentEmbedding({ documentId, chunkSize, chunkOverlap } = {}) {
    const normalizedDocumentId = normalizeDocumentId(documentId);
    const row = await this.repository.findDocumentById(normalizedDocumentId);

    if (!row) {
      throw new Error(`Embedding source document not found: ${normalizedDocumentId}`);
    }

    const document = mapRowToDocument(row);

    if (!document.content) {
      throw new Error(`Embedding source document has no content: ${normalizedDocumentId}`);
    }

    const chunks = this.chunker.chunkText(document.content, {
      chunkSize,
      chunkOverlap,
      metadata: document.metadata,
    });

    if (chunks.length === 0) {
      await this.repository.replaceDocumentChunks(normalizedDocumentId, []);

      return {
        documentId: normalizedDocumentId,
        chunkCount: 0,
      };
    }

    const embeddings = await this.embeddingClient.generateEmbedding(chunks.map((chunk) => chunk.content));
    const embeddedChunks = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    await this.repository.replaceDocumentChunks(normalizedDocumentId, embeddedChunks);

    this.logger.info('Embedding job completed', {
      event: 'embedding_job_completed',
      documentId: normalizedDocumentId,
      chunkCount: embeddedChunks.length,
    });

    return {
      documentId: normalizedDocumentId,
      chunkCount: embeddedChunks.length,
    };
  }
}

export {
  EmbeddingJobService,
  buildEmbeddingJobId,
  normalizeDocumentId,
};
export default new EmbeddingJobService();
