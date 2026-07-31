import { jest } from '@jest/globals';
import { ConversationSummaryService } from '../src/ai/compaction/conversationSummary.service.js';
import {
  collectSummarySourceMessageIds,
  validateStructuredConversationSummary,
} from '../src/ai/compaction/summaryValidator.js';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function structuredSummary(overrides = {}) {
  return {
    userGoal: 'Reserve the selected Monteverde tour',
    confirmedFacts: [{
      fact: 'The corrected participant count is three.',
      sourceMessageIds: ['12:user'],
    }],
    preferences: ['Shared shuttle transportation'],
    decisions: ['Use the corrected participant count of three, not two.'],
    unresolvedQuestions: ['Which pickup location should be used?'],
    pendingActions: [{
      action: 'Confirm the reservation after pickup is supplied.',
      status: 'requires_confirmation',
    }],
    previousSummaryVersion: 2,
    ...overrides,
  };
}

function completion(parsed) {
  return {
    id: 'summary-completion-1',
    model: 'structured-model',
    choices: [{ message: { parsed } }],
  };
}

describe('conversation summary Structured Outputs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a validated cumulative structured summary', async () => {
    const summary = structuredSummary();
    const client = {
      parseStructuredChatCompletion: jest.fn().mockResolvedValue(completion(summary)),
    };
    const service = new ConversationSummaryService({ client, log: mockLogger });

    await expect(service.summarize({
      conversationId: 'conversation-123',
      previousSummary: structuredSummary({
        userGoal: 'Plan a Monteverde tour',
        previousSummaryVersion: 1,
      }),
      previousSummaryVersion: 2,
      messages: [{
        id: '12:user',
        role: 'user',
        content: 'Correction: there will be three participants, not two.',
      }],
      structuredState: {
        selectedTourId: 4,
        pendingTool: 'createReservation',
      },
    })).resolves.toEqual({ success: true, data: summary });

    expect(client.parseStructuredChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('pendingTool'),
        }),
      ]),
      expect.objectContaining({
        schemaName: 'conversation_summary',
        schema: expect.any(Object),
        metadata: expect.objectContaining({
          operation: 'conversation_compaction',
          promptVersion: '1.0.0',
        }),
      })
    );
  });

  it('rejects source IDs that were not supplied by messages or a previous summary', () => {
    expect(validateStructuredConversationSummary(structuredSummary({
      confirmedFacts: [{ fact: 'Unsupported', sourceMessageIds: ['999:user'] }],
    }), {
      previousSummaryVersion: 2,
      sourceMessageIds: ['12:user'],
    })).toEqual({
      success: false,
      code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
      reason: 'unknown_source_message_id',
    });
  });

  it('rejects a mismatched previous summary version', () => {
    expect(validateStructuredConversationSummary(structuredSummary({
      previousSummaryVersion: 1,
    }), {
      previousSummaryVersion: 2,
      sourceMessageIds: ['12:user'],
    })).toEqual(expect.objectContaining({
      success: false,
      reason: 'previous_version_mismatch',
    }));
  });

  it('allows carried facts to retain source IDs from the previous summary', () => {
    const previousSummary = structuredSummary({
      confirmedFacts: [{ fact: 'Tour 4 was selected.', sourceMessageIds: ['4:user'] }],
      previousSummaryVersion: 1,
    });
    const next = structuredSummary({
      confirmedFacts: [
        { fact: 'Tour 4 was selected.', sourceMessageIds: ['4:user'] },
        { fact: 'There are three participants.', sourceMessageIds: ['12:user'] },
      ],
    });

    expect(validateStructuredConversationSummary(next, {
      previousSummary,
      previousSummaryVersion: 2,
      sourceMessageIds: ['12:user'],
    })).toEqual({ success: true, data: next });
    expect(collectSummarySourceMessageIds(next)).toEqual(['4:user', '12:user']);
  });

  it('retries one invalid semantic summary and then returns the correction', async () => {
    const valid = structuredSummary();
    const client = {
      parseStructuredChatCompletion: jest.fn()
        .mockResolvedValueOnce(completion(structuredSummary({
          confirmedFacts: [{ fact: 'Unsupported', sourceMessageIds: ['missing'] }],
        })))
        .mockResolvedValueOnce(completion(valid)),
    };
    const service = new ConversationSummaryService({ client, log: mockLogger });

    await expect(service.summarize({
      conversationId: 'conversation-123',
      previousSummaryVersion: 2,
      messages: [{ id: '12:user', role: 'user', content: 'Three participants.' }],
    })).resolves.toEqual({ success: true, data: valid });
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledTimes(2);
  });
});
