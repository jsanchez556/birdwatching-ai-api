import env from '../config/env.js';
import conversationQueries from '../db/queries/conversation.queries.js';
import reservationService from './reservation.service.js';
import conversationSummaryService from '../ai/compaction/conversationSummary.service.js';
import {
  formatStructuredConversationSummary,
  planConversationCompaction,
  toRoleMessages,
} from '../ai/compaction/conversationCompactor.js';
import { sanitizeToolValue } from '../ai/compaction/toolResultCompactor.js';
import logger from '../utils/logger.js';
import {
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  ConversationSummarySchema,
} from '../ai/schemas/conversationSummary.schema.js';

function toPromptMessages(rows = [], { preserveLast = 0 } = {}) {
  const preserveFrom = Math.max(0, rows.length - preserveLast);
  return rows.flatMap((row, index) => toRoleMessages([row]).map((message) => ({
    ...message,
    ...(index >= preserveFrom ? { preserveDuringCompaction: true } : {}),
  })));
}

function buildStructuredState(metadata, reservation) {
  return sanitizeToolValue({
    ...(metadata && Object.keys(metadata).length > 0 ? { conversation: metadata } : {}),
    ...(reservation ? { reservation } : {}),
  });
}

function validatePersistedSummaryRecord(record) {
  if (!record) return null;
  const validation = ConversationSummarySchema.safeParse(record.summary);
  if (!validation.success
    || record.schema_version !== CONVERSATION_SUMMARY_SCHEMA_VERSION
    || validation.data.previousSummaryVersion !== (record.previous_summary_version ?? null)) {
    return null;
  }
  return {
    ...record,
    summary: validation.data,
  };
}

class ConversationCompactionService {
  constructor({
    queries = conversationQueries,
    summarizer = conversationSummaryService,
    reservations = reservationService,
    log = logger,
    config = env.conversationCompaction,
  } = {}) {
    this.queries = queries;
    this.summarizer = summarizer;
    this.reservations = reservations;
    this.logger = log;
    this.config = config;
  }

  async loadStructuredState(conversationId, userId) {
    const [metadata, reservation] = await Promise.all([
      this.queries.getMetadata(conversationId, userId).catch(() => ({})),
      this.reservations.getLatestReservationForConversation(
        conversationId,
        { userId }
      ).catch(() => null),
    ]);
    return buildStructuredState(metadata, reservation);
  }

  async buildHistory({ conversationId, userId, signal, usage, parentTraceId } = {}) {
    let previousSummaryRecord;
    let rows;

    try {
      [previousSummaryRecord, rows] = await Promise.all([
        this.queries.getLatestSummary(conversationId, userId),
        this.queries.getMessagesForCompaction(
          conversationId,
          this.config.candidateLimit,
          userId
        ),
      ]);
      const validatedSummaryRecord = validatePersistedSummaryRecord(previousSummaryRecord);
      if (previousSummaryRecord && !validatedSummaryRecord) {
        this.logger.warn('Persisted conversation summary failed validation', {
          conversationId,
          version: previousSummaryRecord.version,
        });
      }
      previousSummaryRecord = validatedSummaryRecord;
    } catch (error) {
      this.logger.warn('Conversation compaction context could not be loaded', {
        conversationId,
        errorName: error?.name,
      });
      return null;
    }

    const plan = planConversationCompaction({
      rows,
      previousSummary: previousSummaryRecord?.summary,
      compactedMessageIds: previousSummaryRecord?.compacted_message_ids || [],
      tokenThreshold: this.config.tokenThreshold,
      recentExchangeCount: this.config.recentExchanges,
    });
    const existingSummaryMessage = formatStructuredConversationSummary(previousSummaryRecord);

    if (!plan.shouldCompact) {
      return {
        history: [
          ...(existingSummaryMessage ? [existingSummaryMessage] : []),
          ...toPromptMessages(plan.recentRows, {
            preserveLast: this.config.recentExchanges,
          }),
        ],
        metrics: {
          triggered: false,
          activeTokenCount: plan.activeTokenCount,
          summaryVersion: previousSummaryRecord?.version || null,
          compactedMessageCount: previousSummaryRecord?.compacted_message_ids?.length || 0,
        },
      };
    }

    const messagesToSummarize = toRoleMessages(plan.rowsToCompact);
    const structuredState = await this.loadStructuredState(conversationId, userId);
    let summaryResult;
    try {
      summaryResult = await this.summarizer.summarize({
        conversationId,
        previousSummary: previousSummaryRecord?.summary || null,
        previousSummaryVersion: previousSummaryRecord?.version || null,
        messages: messagesToSummarize,
        structuredState,
        signal,
        usage,
        parentTraceId,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      this.logger.warn('Conversation compaction summarizer failed', {
        conversationId,
        errorName: error?.name,
      });
      summaryResult = {
        success: false,
        code: 'CONVERSATION_SUMMARY_UNAVAILABLE',
        reason: 'summarizer_failed',
      };
    }

    if (!summaryResult.success) {
      this.logger.warn('Conversation compaction skipped after invalid summary', {
        conversationId,
        reason: summaryResult.reason,
        sourceMessageCount: plan.rowsToCompact.length,
      });
      return {
        history: [
          ...(existingSummaryMessage ? [existingSummaryMessage] : []),
          ...toPromptMessages([...plan.rowsToCompact, ...plan.recentRows], {
            preserveLast: this.config.recentExchanges,
          }),
        ],
        metrics: {
          triggered: true,
          persisted: false,
          reason: summaryResult.reason,
          activeTokenCount: plan.activeTokenCount,
          summaryVersion: previousSummaryRecord?.version || null,
          compactedMessageCount: previousSummaryRecord?.compacted_message_ids?.length || 0,
        },
      };
    }

    const nextVersion = (previousSummaryRecord?.version || 0) + 1;
    let savedSummaryRecord;
    try {
      savedSummaryRecord = await this.queries.saveSummary({
        conversationId,
        userId,
        expectedPreviousVersion: previousSummaryRecord?.version || null,
        schemaVersion: CONVERSATION_SUMMARY_SCHEMA_VERSION,
        summary: summaryResult.data,
        compactedMessageIds: plan.compactedMessageIds,
        sourceTokenCount: (previousSummaryRecord?.source_token_count || 0)
          + plan.sourceTokenCount,
      });
    } catch (error) {
      this.logger.warn('Conversation summary persistence failed', {
        conversationId,
        errorCode: error?.code,
      });
    }

    const activeSummaryRecord = savedSummaryRecord || {
      version: nextVersion,
      summary: summaryResult.data,
      compacted_message_ids: plan.compactedMessageIds,
    };

    return {
      history: [
        formatStructuredConversationSummary(activeSummaryRecord),
        ...toPromptMessages(plan.recentRows, {
          preserveLast: this.config.recentExchanges,
        }),
      ],
      metrics: {
        triggered: true,
        persisted: Boolean(savedSummaryRecord),
        activeTokenCount: plan.activeTokenCount,
        summaryVersion: activeSummaryRecord.version,
        compactedMessageCount: plan.compactedMessageIds.length,
        newlyCompactedMessageCount: plan.rowsToCompact.length,
      },
    };
  }
}

const conversationCompactionService = new ConversationCompactionService();

export {
  ConversationCompactionService,
  buildStructuredState,
  toPromptMessages,
  validatePersistedSummaryRecord,
};

export default conversationCompactionService;
