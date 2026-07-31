import userMemoryQueries from '../db/queries/userMemory.queries.js';
import userMemoryExtractor from '../ai/services/userMemoryExtraction.service.js';
import { createStableHash } from '../utils/hash.utils.js';
import logger from '../utils/logger.js';

function memoryFingerprint(category, content) {
  return createStableHash({
    category,
    content: content.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
  });
}

export class UserMemoryService {
  constructor({
    queries = userMemoryQueries,
    extractor = userMemoryExtractor,
    log = logger,
  } = {}) {
    this.queries = queries;
    this.extractor = extractor;
    this.logger = log;
  }

  async prepare({
    userId,
    message,
    conversationId,
    signal,
    usage,
    parentTraceId,
  } = {}) {
    if (userId === undefined || userId === null) {
      return { success: true, memories: [], clarificationRequired: [], skipped: true };
    }

    try {
      const existingMemories = await this.queries.getActive(Number(userId), 50);
      const extraction = await this.extractor.extract({
        message,
        existingMemories,
        signal,
        metadata: { conversationId, usage, parentTraceId },
      });
      if (!extraction.success) {
        return { ...extraction, memories: [], clarificationRequired: [] };
      }
      return {
        success: true,
        userId: Number(userId),
        existingMemories,
        memories: extraction.memories || [],
        clarificationRequired: extraction.clarificationRequired || [],
        skipped: extraction.skipped === true,
      };
    } catch (error) {
      this.logger.warn('Long-term user memory preparation unavailable', { code: error.code });
      return {
        success: false,
        code: 'USER_MEMORY_UNAVAILABLE',
        memories: [],
        clarificationRequired: [],
      };
    }
  }

  async commitPrepared({ userId, sourceMessageId, prepared } = {}) {
    if (userId === undefined || userId === null || !sourceMessageId
      || !prepared?.success || Number(prepared.userId) !== Number(userId)) {
      return { success: true, stored: [], resolutions: [], skipped: true };
    }

    try {
      const stored = [];
      const resolutions = [];
      const existingById = new Map(
        (prepared.existingMemories || []).map((memory) => [Number(memory.id), memory])
      );
      for (const memory of prepared.memories || []) {
        const saved = await this.queries.save({
          userId: Number(userId),
          category: memory.category,
          content: memory.content,
          contentFingerprint: memoryFingerprint(memory.category, memory.content),
          confidence: memory.confidence,
          sourceMessageId: Number(sourceMessageId),
          expiresAt: memory.expiresAt,
          isUserEditable: memory.isUserEditable,
          conflictKey: memory.conflictKey,
          resolution: memory.resolution,
          supersedesMemoryIds: memory.supersedesMemoryIds,
        });
        if (saved) {
          stored.push(saved);
          for (const supersededId of memory.supersedesMemoryIds || []) {
            const superseded = existingById.get(Number(supersededId));
            if (superseded) {
              resolutions.push({
                activeMemory: saved.content,
                supersededMemory: superseded.content,
                resolution: memory.resolution,
              });
            }
          }
        }
      }

      return { success: true, stored, resolutions };
    } catch (error) {
      this.logger.warn('Long-term user memory commit unavailable', { code: error.code });
      return { success: false, code: 'USER_MEMORY_UNAVAILABLE', stored: [], resolutions: [] };
    }
  }

  async capture(options = {}) {
    if (!options.sourceMessageId) {
      return { success: true, stored: [], resolutions: [], skipped: true };
    }
    const prepared = await this.prepare(options);
    return this.commitPrepared({
      userId: options.userId,
      sourceMessageId: options.sourceMessageId,
      prepared,
    });
  }
}

export { memoryFingerprint };
export default new UserMemoryService();
