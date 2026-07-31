import { estimateTokens } from '../context/contextBudget.js';

function compactConversationItems(items = [], { maxItems = 12 } = {}) {
  if (!Array.isArray(items) || items.length <= maxItems) {
    return {
      items: Array.isArray(items) ? items : [],
      compactedItemIds: [],
    };
  }

  const ordered = [...items].sort((left, right) => (
    (left.metadata?.order ?? 0) - (right.metadata?.order ?? 0)
  ));
  const retained = ordered.slice(-maxItems);
  const omitted = ordered.slice(0, -maxItems);
  const summaryContent = omitted.map((item) => {
    const role = item.metadata?.role || 'message';
    return `${role}: ${item.content}`;
  }).join('\n');
  const summary = {
    id: `conversation-summary:${omitted[0].id}:${omitted.at(-1).id}`,
    type: 'summary',
    content: summaryContent,
    source: 'deterministic_conversation_compactor',
    relevanceScore: 0.6,
    trustLevel: 'user_provided',
    createdAt: omitted.at(-1).createdAt,
    estimatedTokens: estimateTokens(summaryContent),
    metadata: {
      sourceIds: omitted.map((item) => item.id),
      coveredRange: {
        first: omitted[0].id,
        last: omitted.at(-1).id,
      },
      compacted: true,
      order: omitted[0].metadata?.order ?? 0,
    },
  };

  return {
    items: [summary, ...retained],
    compactedItemIds: omitted.map((item) => item.id),
  };
}

export {
  compactConversationItems,
};
