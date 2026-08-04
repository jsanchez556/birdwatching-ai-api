import { createStableHash } from '../../utils/hash.utils.js';

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mergeTransformations(...histories) {
  return [...new Set(histories
    .flatMap((history) => Array.isArray(history) ? history : [])
    .map((entry) => String(entry).trim())
    .map((entry) => /^[a-z0-9_:-]{1,80}$/i.test(entry)
      ? entry
      : 'unrecognized_transformation')
    .filter(Boolean))];
}

function safeProvenanceIdentifier(value, prefix = 'source') {
  const normalized = String(value ?? '').trim();
  if (/^[A-Za-z0-9._:-]{1,160}$/.test(normalized)) return normalized;
  return `${prefix}:${createStableHash(normalized).slice(0, 32)}`;
}

function scopedProvenanceIdentifier(value, prefix) {
  if (value === undefined || value === null || value === '') return null;
  return `${prefix}:${createStableHash(String(value)).slice(0, 32)}`;
}

function originalContentHash(item) {
  const supplied = item.originalContentHash || item.metadata?.originalContentHash;
  return typeof supplied === 'string' && /^[a-f0-9]{64}$/i.test(supplied)
    ? supplied.toLowerCase()
    : createStableHash(item.content ?? '');
}

function resolveValidity(expiresAt, now = new Date()) {
  if (!expiresAt) return { validityStatus: 'valid', isValid: true };
  const expiration = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiration)) {
    return { validityStatus: 'invalid_expiration', isValid: false };
  }
  const valid = expiration > now.getTime();
  return { validityStatus: valid ? 'valid' : 'expired', isValid: valid };
}

function createProvenance(item, overrides = {}, { now = new Date() } = {}) {
  const expiresAt = normalizeTimestamp(item.expiresAt);
  const transformations = mergeTransformations(
    item.transformationHistory,
    item.metadata?.transformations,
    overrides.transformations
  );
  return {
    contextItemId: item.id,
    type: item.type,
    source: item.source,
    sourceType: item.sourceType || item.metadata?.sourceType || item.source,
    sourceId: item.metadata?.sourceId || item.id,
    retrievedAt: normalizeTimestamp(item.retrievedAt) || now.toISOString(),
    trustLevel: item.trustLevel,
    createdAt: normalizeTimestamp(item.createdAt),
    expiresAt,
    originalContentHash: originalContentHash(item),
    ...resolveValidity(item.expiresAt, now),
    selected: false,
    selectionReason: 'not_evaluated',
    transformations,
    duplicateOf: null,
    conflictGroup: item.metadata?.conflictGroup || null,
    scope: item.metadata?.scope || null,
    scopeValidation: item.metadata?.scopeValidation || null,
    conflictDecision: item.metadata?.conflictDecision || null,
    originalEstimatedTokens: item.estimatedTokens,
    finalEstimatedTokens: item.estimatedTokens,
    ...overrides,
    transformations,
  };
}

function toSafeProvenance(provenance = []) {
  return provenance.map((entry) => ({
    contextItemId: safeProvenanceIdentifier(entry.contextItemId, 'context-item'),
    type: safeProvenanceIdentifier(entry.type, 'context-type'),
    source: safeProvenanceIdentifier(entry.source, 'source-type'),
    sourceType: safeProvenanceIdentifier(entry.sourceType, 'source-type'),
    sourceId: safeProvenanceIdentifier(entry.sourceId, 'source'),
    retrievedAt: entry.retrievedAt,
    trustLevel: safeProvenanceIdentifier(entry.trustLevel, 'trust'),
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    originalContentHash: entry.originalContentHash,
    validityStatus: safeProvenanceIdentifier(entry.validityStatus, 'validity'),
    isValid: entry.isValid,
    selected: entry.selected,
    selectionReason: safeProvenanceIdentifier(entry.selectionReason, 'selection'),
    transformations: entry.transformations,
    duplicateOf: entry.duplicateOf
      ? safeProvenanceIdentifier(entry.duplicateOf, 'context-item') : null,
    conflictGroup: entry.conflictGroup
      ? safeProvenanceIdentifier(entry.conflictGroup, 'conflict') : null,
    scope: entry.scope ? {
      kind: safeProvenanceIdentifier(entry.scope.kind, 'scope'),
      tenantId: scopedProvenanceIdentifier(entry.scope.tenantId, 'tenant'),
      userId: scopedProvenanceIdentifier(entry.scope.userId, 'user'),
      conversationId: scopedProvenanceIdentifier(entry.scope.conversationId, 'conversation'),
    } : null,
    scopeValidation: entry.scopeValidation ? {
      valid: entry.scopeValidation.valid === true,
      reason: safeProvenanceIdentifier(entry.scopeValidation.reason, 'scope-validation'),
    } : null,
    conflictDecision: entry.conflictDecision ? {
      winningContextItemId: safeProvenanceIdentifier(
        entry.conflictDecision.winningContextItemId,
        'context-item'
      ),
      supersededContextItemIds: (entry.conflictDecision.supersededContextItemIds || [])
        .map((id) => safeProvenanceIdentifier(id, 'context-item')),
      resolution: safeProvenanceIdentifier(entry.conflictDecision.resolution, 'resolution'),
      resolvedAt: normalizeTimestamp(entry.conflictDecision.resolvedAt),
    } : null,
    originalEstimatedTokens: Number.isFinite(Number(entry.originalEstimatedTokens))
      ? Number(entry.originalEstimatedTokens) : null,
    finalEstimatedTokens: Number.isFinite(Number(entry.finalEstimatedTokens))
      ? Number(entry.finalEstimatedTokens) : null,
  }));
}

export {
  createProvenance,
  mergeTransformations,
  normalizeTimestamp,
  originalContentHash,
  resolveValidity,
  safeProvenanceIdentifier,
  scopedProvenanceIdentifier,
  toSafeProvenance,
};
