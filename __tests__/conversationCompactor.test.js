import {
  CONVERSATION_SUMMARY_MARKER,
  compactConversationItems,
  formatStructuredConversationSummary,
  planConversationCompaction,
  toRoleMessages,
} from '../src/ai/compaction/conversationCompactor.js';

function row(id, userInput, aiOutput) {
  return {
    id,
    user_input: userInput,
    ai_output: aiOutput,
    created_at: new Date(`2026-07-${String(id).padStart(2, '0')}T10:00:00.000Z`),
  };
}

describe('conversation compaction planning', () => {
  it('triggers on token size, keeps recent exchanges unchanged, and records compacted IDs', () => {
    const rows = [
      row(1, 'Older user message one', 'Older assistant reply one'),
      row(2, 'Older user message two', 'Older assistant reply two'),
      row(3, 'Recent user message', 'Recent assistant reply'),
    ];
    const plan = planConversationCompaction({
      rows,
      compactedMessageIds: [],
      tokenThreshold: 10,
      recentExchangeCount: 1,
      tokenEstimator: (content) => content.length,
    });

    expect(plan.shouldCompact).toBe(true);
    expect(plan.rowsToCompact.map((entry) => entry.id)).toEqual([1, 2]);
    expect(plan.recentRows).toEqual([rows[2]]);
    expect(plan.compactedMessageIds).toEqual(['1', '2']);
    expect(plan.sourceTokenCount).toBeGreaterThan(0);
  });

  it('does not compact below the configured token threshold', () => {
    const rows = [row(1, 'Short', 'Reply'), row(2, 'Current', 'Response')];
    const plan = planConversationCompaction({
      rows,
      tokenThreshold: 10_000,
      recentExchangeCount: 1,
    });

    expect(plan.shouldCompact).toBe(false);
    expect(plan.rowsToCompact).toEqual([]);
    expect(plan.recentRows).toEqual(rows);
  });

  it('excludes messages already covered by the previous summary', () => {
    const plan = planConversationCompaction({
      rows: [row(1, 'Old', 'Covered'), row(2, 'New', 'Uncovered')],
      compactedMessageIds: ['1'],
      previousSummary: { userGoal: 'Continue planning' },
      tokenThreshold: 10_000,
      recentExchangeCount: 1,
    });

    expect(plan.recentRows.map((entry) => entry.id)).toEqual([2]);
  });

  it('creates stable role-specific source message IDs', () => {
    expect(toRoleMessages([row(9, 'User correction', 'Acknowledged')])).toEqual([
      expect.objectContaining({ id: '9:user', exchangeId: '9', role: 'user' }),
      expect.objectContaining({ id: '9:assistant', exchangeId: '9', role: 'assistant' }),
    ]);
  });

  it('formats a versioned structured summary for prompt context', () => {
    const message = formatStructuredConversationSummary({
      version: 3,
      summary: {
        userGoal: 'Finish booking',
        confirmedFacts: [],
      },
    });

    expect(message.role).toBe('system');
    expect(message.summaryVersion).toBe(3);
    expect(message.content).toContain(`${CONVERSATION_SUMMARY_MARKER} (version 3)`);
    expect(message.content).toContain('"userGoal":"Finish booking"');
  });

  it('does not fabricate an unstructured summary inside ContextBuilder', () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}` }));
    expect(compactConversationItems(items)).toEqual({
      items,
      compactedItemIds: [],
    });
  });
});
