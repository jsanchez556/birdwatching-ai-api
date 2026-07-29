import adminRepository from '../../db/repositories/admin/admin.repository.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';
import {
  OPERATIONAL_ERROR_TYPE_SET,
} from '../../monitoring/operationalErrors.js';
import observabilityService, {
  validateLangSmithUrl,
} from '../../observability/observability.service.js';
import queueFailureFeedService from '../queueFailureFeed.service.js';

const SOURCE_LIMIT = 1000;

const TYPE_PRESENTATION = Object.freeze({
  LLM_ERROR: {
    message: 'AI provider request failed',
    status: 'failed',
  },
  TOOL_ERROR: {
    message: 'Tool execution failed',
    status: 'failed',
  },
  RETRIEVAL_ERROR: {
    message: 'Knowledge retrieval failed',
    status: 'failed',
  },
  INVALID_OUTPUT: {
    message: 'AI output was rejected',
    status: 'blocked',
  },
  QUEUE_FAILURE: {
    message: 'Background job failed',
    status: 'failed',
  },
  RATE_LIMIT: {
    message: 'Request rate limit exceeded',
    status: 'rate_limited',
  },
  PAYMENT_FAILURE: {
    message: 'Payment processing failed',
    status: 'payment_failed',
  },
});

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;

function safeIdentifier(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const normalized = String(value);
  return normalized.length > 0
    && normalized.length <= 160
    && SAFE_IDENTIFIER_PATTERN.test(normalized)
    ? normalized
    : null;
}

function safeTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStoredRecord(row = {}) {
  const type = row.source_type === 'job'
    ? 'QUEUE_FAILURE'
    : row.source_type === 'billing'
      ? 'PAYMENT_FAILURE'
      : null;
  const sourceId = safeIdentifier(row.source_id);

  if (!type || !sourceId) return null;

  return {
    id: `${row.source_type}-${sourceId}`,
    timestamp: row.occurred_at,
    type,
    userId: row.user_id,
    traceId: row.trace_id,
    dedupeKey: row.source_type === 'job'
      ? `queue:${sourceId}`
      : `billing:${sourceId}`,
  };
}

function normalizeRecord(record = {}) {
  const id = safeIdentifier(record.id);
  const timestamp = safeTimestamp(record.timestamp);
  if (!id || !timestamp || !OPERATIONAL_ERROR_TYPE_SET.has(record.type)) return null;

  const presentation = TYPE_PRESENTATION[record.type];
  const userId = safeIdentifier(record.userId);

  return {
    id,
    timestamp,
    type: record.type,
    user: userId ? { id: userId, label: `User ${userId}` } : null,
    traceId: safeIdentifier(record.traceId),
    traceUrl: null,
    message: presentation.message,
    status: presentation.status,
    dedupeKey: safeIdentifier(record.dedupeKey),
  };
}

function deduplicate(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = record.dedupeKey
      || (record.traceId ? `${record.type}:trace:${record.traceId}` : `id:${record.id}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function newestFirst(left, right) {
  const timeDifference = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
  return timeDifference || right.id.localeCompare(left.id);
}

class OperationalErrorsService {
  constructor({
    repository = adminRepository,
    telemetry = aiTelemetry,
    queueFailures = queueFailureFeedService,
    traceResolver = observabilityService,
    sourceLimit = SOURCE_LIMIT,
  } = {}) {
    this.repository = repository;
    this.telemetry = telemetry;
    this.queueFailures = queueFailures;
    this.traceResolver = traceResolver;
    this.sourceLimit = sourceLimit;
  }

  async getErrors({ range, pagination, type = null } = {}) {
    const [storedRows, telemetryRows, queueRows] = await Promise.all([
      this.repository.getOperationalErrors({ ...range, limit: this.sourceLimit }),
      Promise.resolve(this.telemetry.getOperationalErrors()),
      this.queueFailures.getRecentFailures({ ...range, limit: this.sourceLimit }),
    ]);
    const start = new Date(range.startAt).getTime();
    const end = new Date(range.endAt).getTime();
    const records = [
      ...(Array.isArray(storedRows) ? storedRows.map(normalizeStoredRecord) : []),
      ...(Array.isArray(telemetryRows) ? telemetryRows : []),
      ...(Array.isArray(queueRows) ? queueRows : []),
    ]
      .filter(Boolean)
      .map(normalizeRecord)
      .filter(Boolean)
      .filter((record) => {
        const timestamp = new Date(record.timestamp).getTime();
        return timestamp >= start && timestamp < end && (!type || record.type === type);
      })
      .sort(newestFirst);
    const uniqueRecords = deduplicate(records);
    const total = uniqueRecords.length;
    const pageRows = uniqueRecords.slice(
      pagination.offset,
      pagination.offset + pagination.limit
    );
    const traceUrls = new Map();

    await Promise.all(pageRows.map(async (record) => {
      if (!record.traceId || traceUrls.has(record.traceId)) return;
      const resolved = await this.traceResolver.getTraceUrl(record.traceId);
      traceUrls.set(record.traceId, validateLangSmithUrl(resolved));
    }));

    return {
      errors: pageRows.map(({ dedupeKey, ...record }) => ({
        ...record,
        traceUrl: record.traceId ? traceUrls.get(record.traceId) || null : null,
      })),
      total,
    };
  }
}

export {
  OperationalErrorsService,
  SOURCE_LIMIT,
  TYPE_PRESENTATION,
  deduplicate,
  newestFirst,
  normalizeRecord,
  normalizeStoredRecord,
};
export default new OperationalErrorsService();
