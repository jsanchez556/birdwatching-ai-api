function resolveMemoryConflicts(items = []) {
  const groups = new Map();
  for (const item of items) {
    const conflictGroup = item.metadata?.conflictGroup;
    if (!conflictGroup) continue;
    const group = groups.get(conflictGroup) || [];
    group.push(item);
    groups.set(conflictGroup, group);
  }

  const unresolvedConflictIds = [];
  for (const [conflictGroup, group] of groups) {
    if (group.length < 2) continue;
    const authoritative = group.filter((item) => item.trustLevel === 'verified');
    if (authoritative.length !== 1) {
      unresolvedConflictIds.push(conflictGroup);
      for (const item of group) {
        item.metadata = {
          ...(item.metadata || {}),
          conflictStatus: 'unresolved',
          requiresClarification: true,
        };
      }
    }
  }

  return {
    items,
    unresolvedConflictIds: unresolvedConflictIds.sort(),
  };
}

function buildMemoryClarificationInstruction(conflictGroups = []) {
  const normalizedGroups = [...new Set(conflictGroups.filter(Boolean))].sort();
  if (normalizedGroups.length === 0) return null;
  return [
    'An unresolved durable user-memory conflict affects the current request.',
    `Conflict group count: ${normalizedGroups.length}.`,
    'Ask the user one brief clarifying question before relying on either conflicting value or taking an affected action.',
    'Do not guess, merge the values, or describe either value as the current preference until clarified.',
  ].join(' ');
}

export {
  resolveMemoryConflicts,
  buildMemoryClarificationInstruction,
};
