import { createStableHash } from '../../utils/hash.utils.js';
import { normalizeWhitespace } from '../../utils/text.utils.js';
import HttpError from '../../utils/httpError.js';
import { createProvenance } from './contextProvenance.js';

const TRUST_SCORES = Object.freeze({
  system: 1,
  verified: 0.85,
  user_provided: 0.65,
  unverified: 0.35,
});

const SOURCE_PRIORITIES = Object.freeze({
  security_instruction: 1,
  instruction: 0.95,
  tool_result: 0.9,
  application_state: 0.85,
  message: 0.75,
  summary: 0.65,
  memory: 0.6,
  rag_document: 0.55,
  planner_guidance: 0.9,
});

const CATEGORY_BY_TYPE = Object.freeze({
  instruction: 'instructions',
  security_instruction: 'instructions',
  planner_guidance: 'instructions',
  message: 'conversation',
  summary: 'conversation',
  memory: 'memories',
  rag_document: 'retrievedKnowledge',
  tool_result: 'toolResults',
  application_state: 'applicationState',
});

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function normalizeForFingerprint(content) {
  return normalizeWhitespace(content).toLocaleLowerCase('en-US');
}

function contentFingerprint(item) {
  return createStableHash({
    type: item.type,
    content: normalizeForFingerprint(item.content),
  });
}

function computeRecencyScore(createdAt, now = new Date()) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  return Number(Math.exp(-ageDays / 30).toFixed(6));
}

function computeSelectionScore(item, now = new Date()) {
  const relevance = clampScore(item.relevanceScore, 0.5);
  const recency = clampScore(item.recencyScore, computeRecencyScore(item.createdAt, now));
  const trust = TRUST_SCORES[item.trustLevel] ?? 0;
  const sourcePriority = SOURCE_PRIORITIES[item.type] ?? 0.5;

  return Number((
    relevance * 0.4
    + recency * 0.2
    + trust * 0.25
    + sourcePriority * 0.15
  ).toFixed(6));
}

function validateItem(item) {
  return Boolean(
    item
    && typeof item.id === 'string'
    && item.id
    && CATEGORY_BY_TYPE[item.type]
    && typeof item.content === 'string'
    && item.content
    && typeof item.source === 'string'
    && item.source
    && Object.hasOwn(TRUST_SCORES, item.trustLevel)
    && Number.isSafeInteger(item.estimatedTokens)
    && item.estimatedTokens >= 0
  );
}

function comparePreferredDuplicate(left, right) {
  if (left.required !== right.required) return left.required ? -1 : 1;
  const leftTrust = TRUST_SCORES[left.trustLevel];
  const rightTrust = TRUST_SCORES[right.trustLevel];
  if (leftTrust !== rightTrust) return rightTrust - leftTrust;

  const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  return dateDifference || left.id.localeCompare(right.id);
}

function deduplicateItems(items) {
  const groups = new Map();
  for (const item of items) {
    const fingerprint = contentFingerprint(item);
    const group = groups.get(fingerprint) || [];
    group.push(item);
    groups.set(fingerprint, group);
  }

  const retained = [];
  const duplicates = new Map();
  for (const group of groups.values()) {
    const sorted = [...group].sort(comparePreferredDuplicate);
    retained.push(sorted[0]);
    for (const duplicate of sorted.slice(1)) {
      duplicates.set(duplicate.id, sorted[0].id);
    }
  }

  return { retained, duplicates };
}

function compareItems(left, right) {
  if (left.required !== right.required) return left.required ? -1 : 1;
  if (left.selectionScore !== right.selectionScore) {
    return right.selectionScore - left.selectionScore;
  }
  const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  return dateDifference || left.id.localeCompare(right.id);
}

function buildSelectionUnits(items) {
  const units = new Map();
  for (const item of items) {
    const unitId = item.metadata?.bundleId || item.id;
    const unit = units.get(unitId) || {
      id: unitId,
      items: [],
      required: false,
      selectionScore: 0,
      createdAt: item.createdAt,
    };
    unit.items.push(item);
    unit.required ||= item.required === true;
    unit.selectionScore = Math.max(unit.selectionScore, item.selectionScore);
    if (new Date(item.createdAt).getTime() > new Date(unit.createdAt).getTime()) {
      unit.createdAt = item.createdAt;
    }
    units.set(unitId, unit);
  }
  return [...units.values()];
}

function compareUnits(left, right) {
  if (left.required !== right.required) return left.required ? -1 : 1;
  if (left.selectionScore !== right.selectionScore) {
    return right.selectionScore - left.selectionScore;
  }
  const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  return dateDifference || left.id.localeCompare(right.id);
}

function selectContextItems(items, budget, { now = new Date() } = {}) {
  const provenanceById = new Map(items.map((item) => [item.id, createProvenance(item)]));
  const valid = [];

  for (const item of items) {
    const provenance = provenanceById.get(item.id);
    if (!validateItem(item)) {
      provenance.selectionReason = 'invalid';
      continue;
    }
    if (!item.required && item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) {
      provenance.selectionReason = 'expired';
      continue;
    }
    valid.push({
      ...item,
      recencyScore: clampScore(item.recencyScore, computeRecencyScore(item.createdAt, now)),
      selectionScore: computeSelectionScore(item, now),
    });
  }

  const { retained, duplicates } = deduplicateItems(valid);
  for (const [duplicateId, retainedId] of duplicates) {
    const provenance = provenanceById.get(duplicateId);
    provenance.selectionReason = 'duplicate';
    provenance.duplicateOf = retainedId;
    provenance.transformations = ['normalized_content_fingerprint'];
  }

  const required = retained.filter((item) => item.required).sort(compareItems);
  const requiredTokens = required.reduce((total, item) => total + item.estimatedTokens, 0);
  if (requiredTokens > budget.effectiveInputBudget) {
    throw new HttpError(500, 'Mandatory context exceeds the model input budget.', {
      code: 'CONTEXT_REQUIRED_BUDGET_EXCEEDED',
      details: {
        requiredTokens,
        effectiveInputBudget: budget.effectiveInputBudget,
      },
    });
  }

  const selected = [...required];
  let totalTokens = requiredTokens;
  const categoryTokens = required.reduce((counts, item) => {
    const category = CATEGORY_BY_TYPE[item.type];
    counts[category] = (counts[category] || 0) + item.estimatedTokens;
    return counts;
  }, {});

  const optionalUnits = buildSelectionUnits(
    retained.filter((candidate) => !candidate.required)
  ).sort(compareUnits);
  const deferredUnits = [];
  for (const unit of optionalUnits) {
    const category = CATEGORY_BY_TYPE[unit.items[0].type];
    const unitTokens = unit.items.reduce((total, item) => total + item.estimatedTokens, 0);
    const categoryLimit = budget.categories[category]?.soft ?? budget.effectiveInputBudget;
    const nextCategoryTokens = (categoryTokens[category] || 0) + unitTokens;

    if (nextCategoryTokens > categoryLimit) {
      deferredUnits.push(unit);
      continue;
    }
    if (totalTokens + unitTokens > budget.effectiveInputBudget) {
      for (const item of unit.items) {
        provenanceById.get(item.id).selectionReason = 'total_budget';
      }
      continue;
    }

    selected.push(...unit.items);
    totalTokens += unitTokens;
    categoryTokens[category] = nextCategoryTokens;
  }

  for (const unit of deferredUnits) {
    const category = CATEGORY_BY_TYPE[unit.items[0].type];
    const unitTokens = unit.items.reduce((total, item) => total + item.estimatedTokens, 0);
    const categoryLimit = budget.categories[category]?.hard ?? budget.effectiveInputBudget;
    const nextCategoryTokens = (categoryTokens[category] || 0) + unitTokens;

    if (nextCategoryTokens > categoryLimit) {
      for (const item of unit.items) {
        provenanceById.get(item.id).selectionReason = 'category_budget';
      }
      continue;
    }
    if (totalTokens + unitTokens > budget.effectiveInputBudget) {
      for (const item of unit.items) {
        provenanceById.get(item.id).selectionReason = 'total_budget';
      }
      continue;
    }

    selected.push(...unit.items);
    totalTokens += unitTokens;
    categoryTokens[category] = nextCategoryTokens;
  }

  const selectedIds = new Set(selected.map((item) => item.id));
  for (const item of retained) {
    const provenance = provenanceById.get(item.id);
    if (selectedIds.has(item.id)) {
      provenance.selected = true;
      provenance.selectionReason = item.required ? 'required' : 'selected_by_score';
    } else if (provenance.selectionReason === 'not_evaluated') {
      provenance.selectionReason = 'total_budget';
    }
  }

  return {
    selected,
    provenance: [...provenanceById.values()],
  };
}

export {
  CATEGORY_BY_TYPE,
  SOURCE_PRIORITIES,
  TRUST_SCORES,
  computeRecencyScore,
  computeSelectionScore,
  contentFingerprint,
  buildSelectionUnits,
  deduplicateItems,
  normalizeForFingerprint,
  selectContextItems,
  validateItem,
};
