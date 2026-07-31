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
    if (authoritative.length !== 1) unresolvedConflictIds.push(conflictGroup);
  }

  return {
    items,
    unresolvedConflictIds: unresolvedConflictIds.sort(),
  };
}

export {
  resolveMemoryConflicts,
};
