import { ConversationSummarySchema } from '../schemas/conversationSummary.schema.js';

function validateConversationSummary(summary, sourceItems = []) {
  if (!summary || summary.type !== 'summary' || typeof summary.content !== 'string' || !summary.content.trim()) {
    return false;
  }

  const declaredSourceIds = summary.metadata?.sourceIds;
  if (!Array.isArray(declaredSourceIds) || declaredSourceIds.length === 0) {
    return false;
  }

  const availableSourceIds = new Set(sourceItems.map((item) => item.id));
  return declaredSourceIds.every((id) => availableSourceIds.has(id));
}

function collectSummarySourceMessageIds(summary) {
  return (summary?.confirmedFacts || [])
    .flatMap((entry) => entry.sourceMessageIds || []);
}

function validateStructuredConversationSummary(summary, {
  previousSummary = null,
  previousSummaryVersion = null,
  sourceMessageIds = [],
} = {}) {
  const validation = ConversationSummarySchema.safeParse(summary);
  if (!validation.success) {
    return {
      success: false,
      code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
      reason: 'schema_validation_failed',
    };
  }

  if (validation.data.previousSummaryVersion !== previousSummaryVersion) {
    return {
      success: false,
      code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
      reason: 'previous_version_mismatch',
    };
  }

  const allowedSourceIds = new Set([
    ...sourceMessageIds,
    ...collectSummarySourceMessageIds(previousSummary),
  ]);
  const unsupportedSourceId = collectSummarySourceMessageIds(validation.data)
    .find((sourceId) => !allowedSourceIds.has(sourceId));

  if (unsupportedSourceId) {
    return {
      success: false,
      code: 'CONVERSATION_SUMMARY_INVALID_OUTPUT',
      reason: 'unknown_source_message_id',
    };
  }

  return {
    success: true,
    data: validation.data,
  };
}

export {
  collectSummarySourceMessageIds,
  validateConversationSummary,
  validateStructuredConversationSummary,
};
