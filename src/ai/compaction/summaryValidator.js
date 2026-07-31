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

export {
  validateConversationSummary,
};
