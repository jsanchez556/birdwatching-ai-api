import { randomUUID } from 'crypto';
import jobsQueries from '../db/queries/jobs.queries.js';
import ingestService from '../ingestion/services/ingest.service.js';
import { JOB_STATUSES, JOB_TYPES } from '../jobs/jobTypes.js';
import { registerIngestionQueue } from '../queues/ingestion.queue.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';

const SAFE_DOCUMENT_INGESTION_ERROR = 'Document ingestion failed. Please try again.';
const DEFAULT_DOCUMENT_TYPE = 'uploaded_document';
const DEFAULT_SOURCE = 'upload';

function normalizeUserId(userId) {
  const normalized = Number(userId);

  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeJsonDocuments(body = {}, jobId) {
  const documents = Array.isArray(body.documents)
    ? body.documents
    : body.document
      ? [body.document]
      : [];

  if (documents.length > 0) {
    return documents;
  }

  const text = normalizeText(body.text || body.content);

  if (!text) {
    return [];
  }

  return [{
    externalId: normalizeText(body.externalId) || `upload-${jobId}`,
    name: normalizeText(body.name || body.title) || 'Uploaded document',
    description: text,
    documentType: normalizeText(body.documentType) || DEFAULT_DOCUMENT_TYPE,
    category: normalizeText(body.category) || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  }];
}

function normalizeUploadedDocument(upload, jobId) {
  const text = upload?.buffer?.toString('utf8').trim();

  if (!text) {
    return [];
  }

  const filename = normalizeText(upload.filename) || 'uploaded-document.txt';

  return [{
    externalId: `upload-${jobId}`,
    name: filename,
    description: text,
    documentType: DEFAULT_DOCUMENT_TYPE,
    metadata: {
      filename,
      mimeType: upload.mimeType,
    },
  }];
}

function formatIngestionRow(row) {
  if (!row) {
    return {
      status: JOB_STATUSES.NOT_FOUND,
    };
  }

  const response = {
    jobId: row.job_id,
    status: row.status,
  };

  if (row.status === JOB_STATUSES.COMPLETED) {
    response.result = row.result || {};
  }

  if (row.status === JOB_STATUSES.FAILED) {
    response.error = {
      message: row.error_message || SAFE_DOCUMENT_INGESTION_ERROR,
    };
  }

  return response;
}

class DocumentIngestionService {
  constructor({
    queries = jobsQueries,
    queueFactory = registerIngestionQueue,
    ingestionService = ingestService,
  } = {}) {
    this.queries = queries;
    this.queueFactory = queueFactory;
    this.ingestionService = ingestionService;
  }

  async enqueueIngestion({ body = {}, documentUpload, userId } = {}) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      throw new HttpError(401, 'Authentication is required', { code: 'UNAUTHORIZED' });
    }

    const jobId = randomUUID();
    const documents = documentUpload?.buffer?.length
      ? normalizeUploadedDocument(documentUpload, jobId)
      : normalizeJsonDocuments(body, jobId);

    if (documents.length === 0) {
      throw new HttpError(422, 'Document ingestion requires at least one document or text upload.', {
        code: 'validation_error',
        details: [{
          field: 'document',
          message: 'Provide documents, document, text, content, or a raw text upload.',
        }],
      });
    }

    const sourceType = documentUpload?.buffer?.length ? 'upload' : 'json';
    const sourceMetadata = {
      source: normalizeText(body.source) || DEFAULT_SOURCE,
      documentType: normalizeText(body.documentType) || undefined,
      documentCount: documents.length,
      uploadMimeType: documentUpload?.mimeType,
      uploadFilename: documentUpload?.filename,
    };
    const sourcePayload = {
      documents,
      options: {
        force: Boolean(body.force),
        source: normalizeText(body.source) || DEFAULT_SOURCE,
        documentType: normalizeText(body.documentType) || undefined,
      },
    };

    await this.queries.createJob({
      jobId,
      jobType: JOB_TYPES.INGESTION,
      userId: normalizedUserId,
      requestParams: {
        sourceType,
        sourceMetadata,
        sourcePayload,
      },
    });

    try {
      const queue = this.queueFactory();

      await queue.add(JOB_TYPES.INGESTION, {
        jobId,
      }, {
        jobId,
      });
    } catch (error) {
      await this.queries.failJob({
        jobId,
        errorMessage: SAFE_DOCUMENT_INGESTION_ERROR,
      });
      logger.warn('Failed to enqueue document ingestion job', {
        event: 'document_ingestion_enqueue_failed',
        error: error.message,
      });
      throw error;
    }

    logger.info('Document ingestion job queued', {
      event: 'document_ingestion_queued',
      sourceType,
      documentCount: documents.length,
    });

    return {
      jobId,
      status: JOB_STATUSES.QUEUED,
    };
  }

  async getIngestionStatus({ jobId, userId }) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null) {
      return {
        jobId,
        status: JOB_STATUSES.NOT_FOUND,
      };
    }

    const row = await this.queries.getJob({
      jobId,
      userId: normalizedUserId,
      jobType: JOB_TYPES.INGESTION,
    });

    return {
      jobId,
      ...formatIngestionRow(row),
    };
  }

  async processIngestion({ jobId, finalAttempt = true }) {
    const row = await this.queries.getJobForProcessing({
      jobId,
      jobType: JOB_TYPES.INGESTION,
    });

    if (!row) {
      throw new Error(`Document ingestion job not found: ${jobId}`);
    }

    try {
      await this.queries.markActive({ jobId });

      const payload = row.request_params?.sourcePayload || row.source_payload || {};
      const result = await this.ingestionService.ingestDocuments(
        payload.documents || [],
        payload.options || {}
      );

      await this.queries.completeJob({
        jobId,
        result,
      });

      return {
        jobId,
        status: JOB_STATUSES.COMPLETED,
        result,
      };
    } catch (error) {
      if (finalAttempt) {
        await this.queries.failJob({
          jobId,
          errorMessage: SAFE_DOCUMENT_INGESTION_ERROR,
        });
      }
      throw error;
    }
  }
}

export {
  DocumentIngestionService,
  SAFE_DOCUMENT_INGESTION_ERROR,
  formatIngestionRow,
  normalizeJsonDocuments,
  normalizeUploadedDocument,
};
export default new DocumentIngestionService();
