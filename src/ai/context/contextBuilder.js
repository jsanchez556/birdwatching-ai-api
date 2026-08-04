import HttpError from '../../utils/httpError.js';
import { createStableHash } from '../../utils/hash.utils.js';
import { TASK_CATEGORY_SET } from '../routing/modelPolicies.js';
import {
  compactConversationItems,
  CONVERSATION_SUMMARY_MARKER,
} from '../compaction/conversationCompactor.js';
import { validateConversationSummary } from '../compaction/summaryValidator.js';
import {
  compactToolResults,
  sanitizeToolValue,
} from '../compaction/toolResultCompactor.js';
import longTermMemory from '../memory/longTermMemory.js';
import { MemoryRetriever } from '../memory/memoryRetriever.js';
import {
  buildMemoryClarificationInstruction,
  resolveMemoryConflicts,
} from '../memory/memoryConflictResolver.js';
import { createContextBudget, estimateTokens } from './contextBudget.js';
import { buildContextMetrics } from './contextMetrics.js';
import {
  createProvenance,
  mergeTransformations,
  toSafeProvenance,
} from './contextProvenance.js';
import { selectContextItems } from './contextSelector.js';
import { applyContextTrustPolicy } from './contextTrustPolicy.js';
import { inferConversationSignals } from './conversationMessageSelector.js';
import { getSystemPrompt } from '../prompts/system.prompt.js';

const CONTEXT_STAGES = new Set(['planning', 'generation']);
const CONTEXT_ITEM_OVERHEAD_TOKENS = 32;
const SYSTEM_DATA_MARKERS = Object.freeze([
  ['retrieved Costa Rica bird knowledge', 'rag_document', 'unverified', false],
  ['Known booking context from application metadata', 'application_state', 'verified', true],
  ['Internal birdwatching platform tool results', 'tool_result', 'verified', true],
  [CONVERSATION_SUMMARY_MARKER, 'summary', 'user_provided', true],
]);

/**
 * @typedef {'planning'|'generation'} ContextStage
 * @typedef {'system_policy'|'business_rule'|'verified_database_record'|'validated_tool_result'|'current_user_statement'|'validated_rag_document'|'conversation_summary'|'explicit_user_memory'|'inferred_user_memory'|'unverified_external_content'|'model_generated_claim'|'invalid'} TrustLevel
 * @typedef {'instruction'|'security_instruction'|'message'|'summary'|'memory'|'rag_document'|'tool_result'|'application_state'|'planner_guidance'} ContextItemType
 *
 * @typedef {Object} BuildContextInput
 * @property {string|number|null} userId
 * @property {string} conversationId
 * @property {string} task One of the centralized model-routing task categories.
 * @property {ContextStage} stage
 * @property {string} userMessage
 * @property {string} model
 * @property {Array<Object>} [providerMessages]
 * @property {Array<string|Object>} [securityInstructions]
 * @property {Array<string|Object>} [instructions]
 * @property {Object} [conversationSummary]
 * @property {Array<Object>} [memories]
 * @property {Array<Object>} [retrievedKnowledge]
 * @property {Array<Object>} [toolResults]
 * @property {Object} [applicationState]
 * @property {AbortSignal} [signal]
 * @property {string} [parentTraceId]
 * @property {Array<number>} [excludedMemoryIds]
 *
 * @typedef {Object} ContextItem
 * @property {string} id
 * @property {ContextItemType} type
 * @property {string} content
 * @property {string} source
 * @property {string} sourceType
 * @property {number} relevanceScore
 * @property {number} estimatedTokens
 * @property {TrustLevel} trustLevel
 * @property {Date|string} createdAt
 * @property {Date|string} retrievedAt
 * @property {Date|string} [expiresAt]
 * @property {string} originalContentHash
 * @property {Array<string>} transformationHistory
 * @property {boolean} [required]
 * @property {Object} metadata
 */

function contextInputError(message, field) {
  return new HttpError(422, message, {
    code: 'CONTEXT_INPUT_INVALID',
    details: { field },
  });
}

function validateBuildInput(input = {}) {
  if (!TASK_CATEGORY_SET.has(input.task)) {
    throw contextInputError('Context task is unsupported.', 'task');
  }
  if (!CONTEXT_STAGES.has(input.stage)) {
    throw contextInputError('Context stage must be planning or generation.', 'stage');
  }
  if (typeof input.userMessage !== 'string' || !input.userMessage.trim()) {
    throw contextInputError('Current user message is required.', 'userMessage');
  }
  if (typeof input.conversationId !== 'string' || !input.conversationId.trim()) {
    throw contextInputError('Conversation ID is required.', 'conversationId');
  }
  if (typeof input.model !== 'string' || !input.model.trim()) {
    throw contextInputError('Model or model key is required.', 'model');
  }
}

function createItem({
  id,
  type,
  content,
  source,
  sourceType,
  relevanceScore = 0.5,
  trustLevel = 'unverified',
  createdAt,
  retrievedAt,
  expiresAt,
  originalContentHash,
  transformationHistory = [],
  required = false,
  metadata = {},
}, tokenEstimator) {
  const normalizedContent = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    id,
    type,
    content: normalizedContent,
    source,
    sourceType: sourceType || metadata.sourceType || source,
    relevanceScore,
    trustLevel,
    createdAt,
    retrievedAt: retrievedAt || metadata.retrievedAt || createdAt,
    ...(expiresAt ? { expiresAt } : {}),
    originalContentHash: originalContentHash
      || metadata.originalContentHash
      || createStableHash(content ?? ''),
    transformationHistory: mergeTransformations(
      transformationHistory,
      metadata.transformations,
      typeof content === 'string' ? [] : ['structured_serialization']
    ),
    estimatedTokens: tokenEstimator(normalizedContent),
    ...(required ? { required: true } : {}),
    metadata,
  };
}

function classifySystemMessage(content) {
  const marker = SYSTEM_DATA_MARKERS.find(([text]) => content.includes(text));
  if (marker) {
    return {
      type: marker[1],
      trustLevel: marker[2],
      required: marker[3],
    };
  }

  return {
    type: 'instruction',
    trustLevel: 'system',
    required: true,
  };
}

function itemsFromProviderMessages(messages, input, now, tokenEstimator) {
  const normalizedMessages = Array.isArray(messages) && messages.length > 0
    ? messages
    : [
      { role: 'system', content: getSystemPrompt('chat') },
      { role: 'user', content: input.userMessage },
    ];
  let historicalMessageIndex = 0;
  const conversationalMessages = normalizedMessages.filter((message) => (
    message && ['user', 'assistant'].includes(message.role)
  ));
  let conversationPosition = 0;
  let currentUserIndex = -1;
  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    if (normalizedMessages[index]?.role === 'user'
      && normalizedMessages[index]?.content === input.userMessage) {
      currentUserIndex = index;
      break;
    }
  }

  const items = normalizedMessages.flatMap((message, index) => {
    if (!message || typeof message.content !== 'string' || !message.content) return [];
    const sourceId = message.id || `message:${index}`;
    const messageProvenance = message.contextProvenance || message.provenance;
    if (message.role === 'system') {
      const classification = classifySystemMessage(message.content);
      return [createItem({
        id: `context:${sourceId}`,
        ...classification,
        trustLevel: messageProvenance?.trustLevel || classification.trustLevel,
        content: message.content,
        source: classification.type === 'instruction' ? 'prompt_asset' : classification.type,
        sourceType: messageProvenance?.sourceType,
        relevanceScore: classification.required ? 1 : 0.75,
        createdAt: message.createdAt || now,
        retrievedAt: messageProvenance?.retrievedAt || now,
        expiresAt: messageProvenance?.expiresAt,
        originalContentHash: messageProvenance?.originalContentHash,
        transformationHistory: messageProvenance?.transformations,
        metadata: {
          sourceId: messageProvenance?.sourceId || sourceId,
          ...(messageProvenance?.scope ? { scope: messageProvenance.scope } : {}),
          ...(Number.isInteger(messageProvenance?.ragChunksSelected)
            ? { ragChunksSelected: messageProvenance.ragChunksSelected } : {}),
          order: index,
          role: 'system',
          ...(message.summaryVersion ? { summaryVersion: message.summaryVersion } : {}),
        },
      }, tokenEstimator)];
    }
    if (!['user', 'assistant'].includes(message.role)) return [];

    const currentRequest = index === currentUserIndex;
    const signals = currentRequest ? {
      semanticRelevance: 1,
      recency: 1,
      explicitCorrection: 0,
      unresolvedStatus: 0,
      safetyRelevance: 0,
      businessImportance: 0,
      confirmedReservation: false,
      unresolvedCommitment: false,
      contextScore: 1,
      preservationReasons: ['current_request'],
    } : inferConversationSignals(message, {
      currentRequest: input.userMessage,
      position: conversationPosition,
      totalMessages: conversationalMessages.length,
    });
    conversationPosition += 1;
    const bundleId = currentRequest
      ? null
      : `conversation-exchange:${message.exchangeId || Math.floor(historicalMessageIndex / 2)}`;
    if (!currentRequest) historicalMessageIndex += 1;
    return [createItem({
      id: currentRequest
        ? `current-request:${createStableHash(input.userMessage)}`
        : `conversation:${sourceId}`,
      type: 'message',
      content: currentRequest ? input.userMessage : message.content,
      source: currentRequest ? 'current_request' : 'conversation_history',
      sourceType: messageProvenance?.sourceType,
      relevanceScore: signals.semanticRelevance,
      trustLevel: 'user_provided',
      createdAt: message.createdAt || now,
      retrievedAt: messageProvenance?.retrievedAt || now,
      expiresAt: messageProvenance?.expiresAt,
      originalContentHash: messageProvenance?.originalContentHash,
      transformationHistory: messageProvenance?.transformations,
      required: currentRequest
        || message.preserveDuringCompaction === true
        || signals.preservationReasons.length > 0,
      metadata: {
        sourceId: messageProvenance?.sourceId || sourceId,
        ...(messageProvenance?.scope ? { scope: messageProvenance.scope } : {}),
        order: index,
        role: message.role,
        currentRequest,
        contextScore: signals.contextScore,
        semanticRelevance: signals.semanticRelevance,
        recency: signals.recency,
        businessImportance: signals.businessImportance,
        unresolvedStatus: signals.unresolvedStatus,
        explicitCorrection: signals.explicitCorrection,
        safetyRelevance: signals.safetyRelevance,
        preservationReasons: signals.preservationReasons,
        recentVerbatim: message.preserveDuringCompaction === true,
        ...(bundleId ? { bundleId } : {}),
      },
    }, tokenEstimator)];
  });

  if (currentUserIndex < 0) {
    items.push(createItem({
      id: `current-request:${createStableHash(input.userMessage)}`,
      type: 'message',
      content: input.userMessage,
      source: 'current_request',
      relevanceScore: 1,
      trustLevel: 'user_provided',
      createdAt: now,
      retrievedAt: now,
      required: true,
      metadata: {
        sourceId: 'current_request',
        order: normalizedMessages.length,
        role: 'user',
        currentRequest: true,
      },
    }, tokenEstimator));
  }

  return items;
}

function normalizeExternalItems(items, defaults, now, tokenEstimator) {
  return (Array.isArray(items) ? items : []).map((item, index) => createItem({
    id: String(item.id || `${defaults.type}:${index}:${createStableHash(item.content || item)}`),
    type: defaults.type,
    content: item.content || item.text || item.description || item,
    source: String(item.source || defaults.source),
    sourceType: item.sourceType || item.metadata?.sourceType || defaults.sourceType,
    relevanceScore: item.relevanceScore ?? item.score ?? defaults.relevanceScore,
    trustLevel: item.trustLevel || defaults.trustLevel,
    createdAt: item.createdAt || now,
    retrievedAt: item.retrievedAt || item.metadata?.retrievedAt || now,
    expiresAt: item.expiresAt,
    originalContentHash: item.originalContentHash || item.metadata?.originalContentHash,
    transformationHistory: item.transformationHistory || item.metadata?.transformations,
    required: item.required === true,
    metadata: {
      ...(item.metadata || {}),
      sourceId: item.sourceId || item.id,
      order: item.order ?? index,
    },
  }, tokenEstimator));
}

function createEmptyPackage(selected) {
  return {
    instructions: selected.filter((item) => (
      item.type === 'instruction'
      || item.type === 'security_instruction'
      || item.type === 'planner_guidance'
    )),
    conversation: selected.filter((item) => item.type === 'message' || item.type === 'summary'),
    memories: selected.filter((item) => item.type === 'memory'),
    retrievedKnowledge: selected.filter((item) => item.type === 'rag_document'),
    toolResults: selected.filter((item) => item.type === 'tool_result'),
    applicationState: selected.filter((item) => item.type === 'application_state'),
  };
}

class ContextBuilder {
  constructor({
    memoryStore = longTermMemory,
    tokenEstimator = estimateTokens,
    clock = () => new Date(),
    budgetFactory = createContextBudget,
    metricsRecorder,
    conversationCompactor = compactConversationItems,
    summaryValidator = validateConversationSummary,
    toolCompactor = compactToolResults,
  } = {}) {
    this.memoryRetriever = new MemoryRetriever({ store: memoryStore });
    this.tokenEstimator = tokenEstimator;
    this.clock = clock;
    this.budgetFactory = budgetFactory;
    this.metricsRecorder = metricsRecorder;
    this.conversationCompactor = conversationCompactor;
    this.summaryValidator = summaryValidator;
    this.toolCompactor = toolCompactor;
  }

  async build(input = {}) {
    validateBuildInput(input);
    const startedAt = Date.now();
    const now = this.clock();
    const degradedSources = [];
    const providerItems = itemsFromProviderMessages(
      input.providerMessages,
      input,
      now,
      this.tokenEstimator
    );
    const conversationItems = providerItems.filter((item) => item.type === 'message');
    const nonConversationItems = providerItems.filter((item) => item.type !== 'message');
    let compactedConversation = this.conversationCompactor(conversationItems, {
      maxItems: input.maxRecentMessages || 20,
    });
    const generatedSummary = compactedConversation.items
      .find((item) => item.type === 'summary');
    if (generatedSummary && !this.summaryValidator(generatedSummary, conversationItems)) {
      degradedSources.push('conversation_compaction');
      compactedConversation = {
        items: conversationItems,
        compactedItemIds: [],
      };
    }

    const explicitInstructions = [
      ...normalizeExternalItems(input.securityInstructions, {
        type: 'security_instruction',
        source: 'security_instruction',
        relevanceScore: 1,
        trustLevel: 'system',
      }, now, this.tokenEstimator).map((item) => ({ ...item, required: true })),
      ...normalizeExternalItems(input.instructions, {
        type: 'instruction',
        source: 'instruction',
        relevanceScore: 1,
        trustLevel: 'system',
      }, now, this.tokenEstimator).map((item) => ({ ...item, required: true })),
    ];
    const suppliedSummaryInput = typeof input.conversationSummary === 'string'
      ? { content: input.conversationSummary, validated: false }
      : input.conversationSummary;
    const suppliedSummary = suppliedSummaryInput
      ? normalizeExternalItems([{
        ...suppliedSummaryInput,
        required: suppliedSummaryInput.validated === true,
        trustLevel: suppliedSummaryInput.validated === true
          ? (suppliedSummaryInput.trustLevel || 'user_provided')
          : 'invalid',
      }], {
        type: 'summary',
        source: 'conversation_summary',
        relevanceScore: 0.7,
        trustLevel: 'user_provided',
      }, now, this.tokenEstimator)
      : [];

    let memories = normalizeExternalItems(input.memories, {
      type: 'memory',
      source: 'long_term_memory',
      relevanceScore: 0.6,
      trustLevel: 'user_provided',
    }, now, this.tokenEstimator);

    if (!input.memories && input.userId !== undefined && input.userId !== null) {
      try {
        const retrieved = await this.memoryRetriever.retrieve({
          userId: input.userId,
          query: input.userMessage,
          signal: input.signal,
          parentTraceId: input.parentTraceId,
          excludedMemoryIds: input.excludedMemoryIds,
        });
        memories = normalizeExternalItems(retrieved, {
          type: 'memory',
          source: 'long_term_memory',
          relevanceScore: 0.6,
          trustLevel: 'user_provided',
        }, now, this.tokenEstimator);
      } catch {
        degradedSources.push('long_term_memory');
      }
    }

    const memoryResolution = resolveMemoryConflicts(memories);
    const conflictInstructionContent = buildMemoryClarificationInstruction(
      memoryResolution.unresolvedConflictIds
    );
    const memoryConflictInstructions = conflictInstructionContent
      ? normalizeExternalItems([{
        id: `memory-conflict:${createStableHash(memoryResolution.unresolvedConflictIds)}`,
        content: conflictInstructionContent,
        required: true,
      }], {
        type: 'instruction',
        source: 'memory_conflict',
        relevanceScore: 1,
        trustLevel: 'system',
      }, now, this.tokenEstimator)
      : [];
    const retrievedKnowledge = normalizeExternalItems(input.retrievedKnowledge, {
      type: 'rag_document',
      source: 'rag',
      relevanceScore: 0.7,
      trustLevel: 'unverified',
    }, now, this.tokenEstimator);
    const applicationState = input.applicationState
      ? normalizeExternalItems([{
        id: `application-state:${input.conversationId}`,
        content: sanitizeToolValue(input.applicationState),
        required: true,
        metadata: {
          sourceId: input.applicationState.sourceId || input.conversationId,
          sourceType: 'application_state',
          originalContentHash: createStableHash(input.applicationState),
          transformations: ['field_filtering'],
        },
      }], {
        type: 'application_state',
        source: 'application_state',
        relevanceScore: 0.9,
        trustLevel: 'verified',
      }, now, this.tokenEstimator)
      : [];
    const toolResults = input.stage === 'generation'
      ? this.toolCompactor(input.toolResults, {
        now,
        scope: {
          tenantId: input.tenantId,
          userId: input.userId,
          conversationId: input.conversationId,
        },
      })
      : [];
    const unguardedCandidates = [
      ...explicitInstructions,
      ...memoryConflictInstructions,
      ...nonConversationItems,
      ...compactedConversation.items,
      ...suppliedSummary,
      ...memoryResolution.items,
      ...retrievedKnowledge,
      ...applicationState,
      ...toolResults,
    ].map((item) => ({
      ...item,
      estimatedTokens: this.tokenEstimator(item.content) + CONTEXT_ITEM_OVERHEAD_TOKENS,
    }));
    const trustResolution = applyContextTrustPolicy(unguardedCandidates, {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
    }, { now });
    const unresolvedNonMemoryGroups = trustResolution.unresolvedConflictIds.filter((group) => (
      trustResolution.items.some((item) => (
        item.metadata?.conflictGroup === group && item.type !== 'memory'
      ))
    ));
    const conflictGuardItems = unresolvedNonMemoryGroups.length
      ? normalizeExternalItems([{
        id: `context-conflict:${createStableHash(unresolvedNonMemoryGroups)}`,
        content: [
          'An unresolved context conflict affects the current request.',
          `Conflict group count: ${unresolvedNonMemoryGroups.length}.`,
          'Ask one concise clarification question or refresh the authoritative source before relying on either value or taking an affected action.',
          'Do not silently choose, merge, or operationalize either value.',
        ].join(' '),
        required: true,
      }], {
        type: 'instruction',
        source: 'context_conflict',
        relevanceScore: 1,
        trustLevel: 'system_policy',
      }, now, this.tokenEstimator)
      : [];
    const candidates = applyContextTrustPolicy([
      ...trustResolution.items,
      ...conflictGuardItems,
    ], {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
    }, { now }).items;
    const budget = this.budgetFactory({
      model: input.model,
      task: input.task,
      ...(input.budgetOptions || {}),
    });
    const selection = selectContextItems(candidates, budget, { now });
    const compactedIds = new Set(compactedConversation.compactedItemIds);
    const compactedPolicyItems = applyContextTrustPolicy(
      conversationItems.filter((item) => compactedIds.has(item.id)),
      {
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
      },
      { now }
    ).items;
    const compactedProvenance = compactedPolicyItems
      .map((item) => createProvenance(item, {
        selected: false,
        selectionReason: 'compacted',
        transformations: mergeTransformations(
          item.transformationHistory,
          ['conversation_compaction']
        ),
        finalEstimatedTokens: 0,
      }, { now }));
    selection.provenance.push(...compactedProvenance);

    const contextPackage = createEmptyPackage(selection.selected);
    contextPackage.estimatedTokens = selection.selected
      .reduce((total, item) => total + item.estimatedTokens, 0);
    contextPackage.provenance = selection.provenance;
    contextPackage.traceProvenance = toSafeProvenance(selection.provenance);
    contextPackage.metrics = buildContextMetrics({
      stage: input.stage,
      task: input.task,
      model: input.model,
      budget,
      candidates: [...candidates, ...conversationItems.filter((item) => compactedIds.has(item.id))],
      selected: selection.selected,
      provenance: selection.provenance,
      durationMs: Math.max(0, Date.now() - startedAt),
      degradedSources,
      unresolvedConflictCount: memoryResolution.unresolvedConflictIds.length,
      conflictResolutionCount: trustResolution.decisions.length,
      memoriesRetrieved: memories.length,
    });

    try {
      this.metricsRecorder?.record?.(contextPackage.metrics);
    } catch {
      // Metrics must never fail prompt assembly.
    }

    return contextPackage;
  }
}

const contextBuilder = new ContextBuilder();

export {
  CONTEXT_STAGES,
  CONTEXT_ITEM_OVERHEAD_TOKENS,
  ContextBuilder,
  classifySystemMessage,
  contextBuilder,
  createItem,
  itemsFromProviderMessages,
  validateBuildInput,
};

export default contextBuilder;
