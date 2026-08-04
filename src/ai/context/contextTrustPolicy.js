const CONTEXT_TRUST_LEVELS = Object.freeze({
  system_policy: 110,
  business_rule: 100,
  verified_database_record: 90,
  validated_tool_result: 80,
  current_user_statement: 70,
  validated_rag_document: 60,
  conversation_summary: 50,
  explicit_user_memory: 40,
  inferred_user_memory: 30,
  unverified_external_content: 20,
  model_generated_claim: 10,
  invalid: 0,
});

const GLOBAL_CONTEXT_TYPES = new Set([
  'instruction',
  'security_instruction',
  'planner_guidance',
  'rag_document',
]);

function normalizeIdentifier(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeTrustLevel(item = {}) {
  const declared = String(item.trustLevel || '').trim().toLowerCase();
  const sourceType = String(item.sourceType || item.metadata?.sourceType || item.source || '')
    .trim().toLowerCase();
  const role = String(item.metadata?.role || '').trim().toLowerCase();

  if (declared === 'invalid') return 'invalid';
  if (item.type === 'security_instruction' || sourceType === 'prompt_asset') {
    return 'system_policy';
  }
  if (item.type === 'instruction') return 'business_rule';
  if (item.type === 'application_state') return 'verified_database_record';
  if (item.type === 'tool_result') {
    return item.metadata?.contextValidation?.valid === true
      ? 'validated_tool_result'
      : 'invalid';
  }
  if (item.type === 'rag_document') {
    return declared === 'validated_rag_document' || declared === 'verified'
      ? 'validated_rag_document'
      : 'unverified_external_content';
  }
  if (item.type === 'summary') return 'conversation_summary';
  if (item.type === 'memory') {
    return item.metadata?.inferred === true || declared === 'inferred_user_memory'
      ? 'inferred_user_memory'
      : 'explicit_user_memory';
  }
  if (item.type === 'message') {
    return role === 'user' ? 'current_user_statement' : 'model_generated_claim';
  }
  if (Object.hasOwn(CONTEXT_TRUST_LEVELS, declared)) return declared;
  if (declared === 'system') return 'system_policy';
  if (declared === 'verified') return 'verified_database_record';
  if (declared === 'user_provided') return 'current_user_statement';
  return 'unverified_external_content';
}

function defaultScopeForItem(item = {}, expectedScope = {}) {
  const userId = normalizeIdentifier(expectedScope.userId);
  const conversationId = normalizeIdentifier(expectedScope.conversationId);
  const tenantId = normalizeIdentifier(expectedScope.tenantId);
  const metadata = item.metadata || {};

  if (item.type === 'memory') {
    return { kind: 'user', tenantId, userId };
  }
  if (GLOBAL_CONTEXT_TYPES.has(item.type)) {
    const ownerUserId = normalizeIdentifier(
      metadata.ownerUserId ?? metadata.scope?.userId
    );
    return ownerUserId
      ? { kind: 'user', tenantId, userId: ownerUserId }
      : { kind: 'global', tenantId: null, userId: null, conversationId: null };
  }
  return { kind: 'conversation', tenantId, userId, conversationId };
}

function normalizeScope(item = {}, expectedScope = {}) {
  const supplied = item.metadata?.scope;
  const scope = supplied && typeof supplied === 'object'
    ? supplied
    : defaultScopeForItem(item, expectedScope);
  return {
    kind: ['global', 'tenant', 'user', 'conversation'].includes(scope.kind)
      ? scope.kind
      : 'invalid',
    tenantId: normalizeIdentifier(scope.tenantId),
    userId: normalizeIdentifier(scope.userId),
    conversationId: normalizeIdentifier(scope.conversationId),
  };
}

function validateScope(scope = {}, expectedScope = {}) {
  const expectedTenantId = normalizeIdentifier(expectedScope.tenantId);
  const expectedUserId = normalizeIdentifier(expectedScope.userId);
  const expectedConversationId = normalizeIdentifier(expectedScope.conversationId);

  if (scope.kind === 'global') return { valid: true, reason: 'global_scope' };
  if (scope.kind === 'invalid') return { valid: false, reason: 'malformed_scope' };
  if (scope.tenantId !== null && scope.tenantId !== expectedTenantId) {
    return { valid: false, reason: 'tenant_scope_mismatch' };
  }
  if (scope.kind === 'tenant') {
    return expectedTenantId !== null
      ? { valid: true, reason: 'tenant_scope_match' }
      : { valid: false, reason: 'tenant_scope_unavailable' };
  }
  if (scope.userId !== expectedUserId) {
    return { valid: false, reason: 'user_scope_mismatch' };
  }
  if (scope.kind === 'user') {
    return expectedUserId !== null
      ? { valid: true, reason: 'user_scope_match' }
      : { valid: false, reason: 'anonymous_cross_session_scope_forbidden' };
  }
  if (scope.conversationId === null || scope.conversationId !== expectedConversationId) {
    return { valid: false, reason: 'conversation_scope_mismatch' };
  }
  return { valid: true, reason: 'conversation_scope_match' };
}

function compareTrust(left, right) {
  return (CONTEXT_TRUST_LEVELS[normalizeTrustLevel(right)] || 0)
    - (CONTEXT_TRUST_LEVELS[normalizeTrustLevel(left)] || 0);
}

function isExplicitCorrection(item = {}) {
  return item.type === 'message'
    && item.metadata?.role === 'user'
    && (Number(item.metadata?.explicitCorrection) > 0
      || item.metadata?.resolution === 'explicit_recent_correction');
}

function resolveContextConflicts(items = [], { now = new Date() } = {}) {
  const groups = new Map();
  for (const item of items) {
    const key = item.metadata?.conflictGroup;
    if (!key || item.metadata?.policyExclusionReason) continue;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const decisions = [];
  const unresolvedConflictIds = [];
  for (const [conflictGroup, group] of groups) {
    if (group.length < 2) continue;
    const userIntentConflict = /^(?:preference|preferences|preferred_language|bird_interests|budget_ranges|recurring_travel_constraints|user_intent|memory):/i.test(conflictGroup)
      && group.every((item) => ['message', 'memory'].includes(item.type));
    const corrections = (userIntentConflict ? group.filter(isExplicitCorrection) : [])
      .sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      || right.id.localeCompare(left.id)
      ));
    const ranked = [...group].sort((left, right) => (
      compareTrust(left, right)
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      || left.id.localeCompare(right.id)
    ));
    const winner = corrections[0] || ranked[0];
    const winnerTrust = CONTEXT_TRUST_LEVELS[normalizeTrustLevel(winner)] || 0;
    const peers = ranked.filter((item) => (
      (CONTEXT_TRUST_LEVELS[normalizeTrustLevel(item)] || 0) === winnerTrust
    ));
    const resolution = corrections.length === 1
      ? 'explicit_recent_correction'
      : peers.length === 1 ? 'higher_trust_source' : null;

    if (!resolution) {
      unresolvedConflictIds.push(conflictGroup);
      for (const item of group) {
        item.metadata = {
          ...item.metadata,
          conflictStatus: 'unresolved',
          requiresClarification: true,
        };
      }
      continue;
    }

    const supersededContextItemIds = group
      .filter((item) => item !== winner)
      .map((item) => item.id);
    const decision = {
      winningContextItemId: winner.id,
      supersededContextItemIds,
      resolution,
      resolvedAt: now.toISOString(),
    };
    decisions.push(decision);
    winner.transformationHistory = [
      ...(winner.transformationHistory || []),
      `conflict_resolution:${resolution}`,
    ];
    winner.metadata = { ...winner.metadata, conflictStatus: 'resolved', conflictDecision: decision };
    for (const item of group) {
      if (item === winner) continue;
      item.transformationHistory = [
        ...(item.transformationHistory || []),
        `conflict_resolution:${resolution}`,
      ];
      item.metadata = {
        ...item.metadata,
        conflictStatus: 'superseded',
        conflictDecision: decision,
        policyExclusionReason: 'superseded_context',
      };
    }
  }
  return { items, decisions, unresolvedConflictIds: unresolvedConflictIds.sort() };
}

function applyContextTrustPolicy(items = [], expectedScope = {}, { now = new Date() } = {}) {
  const normalized = items.map((item) => {
    const scope = normalizeScope(item, expectedScope);
    const scopeValidation = validateScope(scope, expectedScope);
    const trustLevel = normalizeTrustLevel(item);
    const expiresAt = item.expiresAt ? new Date(item.expiresAt).getTime() : null;
    const freshnessExclusion = item.expiresAt && !Number.isFinite(expiresAt)
      ? 'invalid_expiration'
      : expiresAt !== null && expiresAt <= now.getTime() ? 'expired' : null;
    return {
      ...item,
      trustLevel,
      metadata: {
        ...(item.metadata || {}),
        scope,
        scopeValidation,
        ...(scopeValidation.valid ? {} : { policyExclusionReason: scopeValidation.reason }),
        ...(freshnessExclusion ? { policyExclusionReason: freshnessExclusion } : {}),
        ...(trustLevel === 'invalid' ? { policyExclusionReason: 'invalid_trust' } : {}),
      },
    };
  });
  return resolveContextConflicts(normalized, { now });
}

export {
  CONTEXT_TRUST_LEVELS,
  applyContextTrustPolicy,
  compareTrust,
  defaultScopeForItem,
  normalizeScope,
  normalizeTrustLevel,
  resolveContextConflicts,
  validateScope,
};
