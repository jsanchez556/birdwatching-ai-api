import { randomUUID } from 'node:crypto';
import toolResultReferenceQueries from '../db/queries/toolResultReference.queries.js';

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function referencePrefix(toolName = '') {
  const normalized = String(toolName)
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || 'tool_result';
}

export class ToolResultReferenceService {
  constructor({
    queries = toolResultReferenceQueries,
    idFactory = randomUUID,
    clock = () => new Date(),
    retentionMs = DEFAULT_RETENTION_MS,
  } = {}) {
    this.queries = queries;
    this.idFactory = idFactory;
    this.clock = clock;
    this.retentionMs = retentionMs;
  }

  async store({ toolName, result, total, conversationId, userId }) {
    if (!conversationId || !toolName || result === undefined) return null;
    const createdAt = this.clock();
    const expiresAt = new Date(createdAt.getTime() + this.retentionMs);
    const referenceId = `${referencePrefix(toolName)}_${this.idFactory()}`;
    return this.queries.save({
      referenceId,
      conversationId,
      userId,
      toolName,
      result,
      total,
      expiresAt,
    });
  }

  async retrieve({ referenceId, conversationId, userId }) {
    if (!referenceId || !conversationId) return null;
    return this.queries.get({ referenceId, conversationId, userId });
  }
}

export { DEFAULT_RETENTION_MS, referencePrefix };
export default new ToolResultReferenceService();

