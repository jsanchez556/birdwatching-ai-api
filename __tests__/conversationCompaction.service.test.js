import { jest } from '@jest/globals';
import {
  ConversationCompactionService,
  validatePersistedSummaryRecord,
} from '../src/services/conversationCompaction.service.js';

const log = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function row(id, size = 20) {
  return {
    id,
    user_input: `user-${id}-${'x'.repeat(size)}`,
    ai_output: `assistant-${id}-${'y'.repeat(size)}`,
    created_at: new Date(`2026-07-${String(id).padStart(2, '0')}T10:00:00.000Z`),
  };
}

function summary(previousSummaryVersion = null) {
  return {
    userGoal: 'Complete a tour reservation',
    confirmedFacts: [{ fact: 'Tour 4 is selected.', sourceMessageIds: ['1:user'] }],
    preferences: ['Shared shuttle'],
    decisions: ['Use three participants.'],
    unresolvedQuestions: ['What is the pickup location?'],
    pendingActions: [{ action: 'Confirm booking', status: 'requires_confirmation' }],
    previousSummaryVersion,
  };
}

function createService({ rows, previousSummary = null, summaryResult } = {}) {
  const queries = {
    getLatestSummary: jest.fn().mockResolvedValue(previousSummary),
    getMessagesForCompaction: jest.fn().mockResolvedValue(rows || []),
    getMetadata: jest.fn().mockResolvedValue({
      selectedTourId: 4,
      participants: 3,
      pendingTool: 'createReservation',
    }),
    saveSummary: jest.fn().mockImplementation(async (input) => ({
      version: (input.expectedPreviousVersion || 0) + 1,
      summary: input.summary,
      compacted_message_ids: input.compactedMessageIds,
      source_token_count: input.sourceTokenCount,
      previous_summary_version: input.expectedPreviousVersion,
    })),
  };
  const summarizer = {
    summarize: jest.fn().mockResolvedValue(summaryResult || {
      success: true,
      data: summary(previousSummary?.version || null),
    }),
  };
  const reservations = {
    getLatestReservationForConversation: jest.fn().mockResolvedValue({
      reservationId: 88,
      status: 'pending',
    }),
  };
  const service = new ConversationCompactionService({
    queries,
    summarizer,
    reservations,
    log,
    config: {
      tokenThreshold: 20,
      recentExchanges: 1,
      candidateLimit: 100,
    },
  });
  return { service, queries, summarizer, reservations };
}

describe('conversation compaction orchestration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('summarizes older exchanges, persists a new version, and keeps recent messages unchanged', async () => {
    const rows = [row(1), row(2), row(3)];
    const { service, queries, summarizer } = createService({ rows });

    const result = await service.buildHistory({
      conversationId: 'conversation-123',
      userId: 7,
    });

    expect(summarizer.summarize).toHaveBeenCalledWith(expect.objectContaining({
      previousSummary: null,
      previousSummaryVersion: null,
      messages: expect.arrayContaining([
        expect.objectContaining({ id: '1:user' }),
        expect.objectContaining({ id: '2:assistant' }),
      ]),
      structuredState: expect.objectContaining({
        conversation: expect.objectContaining({ pendingTool: 'createReservation' }),
        reservation: expect.objectContaining({ reservationId: 88 }),
      }),
    }));
    expect(queries.saveSummary).toHaveBeenCalledWith(expect.objectContaining({
      expectedPreviousVersion: null,
      compactedMessageIds: ['1', '2'],
      schemaVersion: '1.0.0',
    }));
    expect(result.history[0].content).toContain('version 1');
    expect(result.history.slice(1)).toEqual([
      expect.objectContaining({ role: 'user', content: rows[2].user_input }),
      expect.objectContaining({ role: 'assistant', content: rows[2].ai_output }),
    ]);
    expect(result.history.slice(1).every((message) => message.preserveDuringCompaction)).toBe(true);
    expect(result.metrics).toEqual(expect.objectContaining({
      triggered: true,
      persisted: true,
      summaryVersion: 1,
      newlyCompactedMessageCount: 2,
    }));
  });

  it('merges a previous summary and advances its version', async () => {
    const previousSummary = {
      version: 2,
      schema_version: '1.0.0',
      summary: summary(1),
      previous_summary_version: 1,
      compacted_message_ids: ['1'],
      source_token_count: 100,
    };
    const { service, queries, summarizer } = createService({
      rows: [row(1), row(2), row(3)],
      previousSummary,
    });

    const result = await service.buildHistory({ conversationId: 'conversation-123', userId: 7 });

    expect(summarizer.summarize).toHaveBeenCalledWith(expect.objectContaining({
      previousSummary: previousSummary.summary,
      previousSummaryVersion: 2,
    }));
    expect(queries.saveSummary).toHaveBeenCalledWith(expect.objectContaining({
      expectedPreviousVersion: 2,
      compactedMessageIds: ['1', '2'],
    }));
    expect(result.metrics.summaryVersion).toBe(3);
  });

  it('keeps all uncompacted messages when structured summarization fails', async () => {
    const rows = [row(1), row(2), row(3)];
    const { service, queries } = createService({
      rows,
      summaryResult: {
        success: false,
        code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
        reason: 'schema_validation_failed',
      },
    });

    const result = await service.buildHistory({ conversationId: 'conversation-123', userId: 7 });

    expect(queries.saveSummary).not.toHaveBeenCalled();
    expect(result.history).toHaveLength(6);
    expect(result.metrics).toEqual(expect.objectContaining({
      triggered: true,
      persisted: false,
      reason: 'schema_validation_failed',
    }));
  });

  it('uses an existing validated summary without a new model call below threshold', async () => {
    const previousSummary = {
      version: 1,
      schema_version: '1.0.0',
      summary: summary(null),
      previous_summary_version: null,
      compacted_message_ids: ['1'],
      source_token_count: 80,
    };
    const { service, summarizer } = createService({
      rows: [row(1), row(2, 0)],
      previousSummary,
    });
    service.config.tokenThreshold = 10_000;

    const result = await service.buildHistory({ conversationId: 'conversation-123', userId: 7 });

    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(result.history[0].content).toContain('version 1');
    expect(result.history.slice(1)).toHaveLength(2);
  });

  it('rejects malformed persisted summaries', () => {
    expect(validatePersistedSummaryRecord({
      version: 2,
      schema_version: '1.0.0',
      previous_summary_version: 1,
      summary: summary(null),
    })).toBeNull();
  });
});
