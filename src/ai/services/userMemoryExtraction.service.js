import openaiClient from '../clients/openai.client.js';
import {
  USER_MEMORY_PROMPT_VERSION,
  USER_MEMORY_SYSTEM_PROMPT,
} from '../prompts/userMemory.prompt.js';
import { UserMemoryExtractionSchema } from '../schemas/userMemory.schema.js';
import { getModel, MODEL_KEYS, MODEL_REGISTRY } from '../routing/modelRegistry.js';
import logger from '../../utils/logger.js';

const MIN_MEMORY_CONFIDENCE = 0.85;
const MIN_EXPLICIT_CORRECTION_CONFIDENCE = 0.9;
const MIN_CLARIFICATION_CONFIDENCE = 0.6;
const MAX_ATTEMPTS = 2;
const UNSAFE_CONTENT_PATTERN = /\b(password|passcode|api[ -]?key|private key|secret|access token|refresh token|credit card|debit card|cvv|social security|passport number|bank account|routing number)\b/i;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const LONG_NUMBER_PATTERN = /\b\d{9,}\b/;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){8,}/;
const PRECISE_ADDRESS_PATTERN = /\b\d{1,5}\s+[\p{L}0-9.'-]+(?:\s+[\p{L}0-9.'-]+){0,3}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|calle|avenida)\b/iu;
const MEMORY_SIGNAL_PATTERN = /\b(prefer|prefers|preference|favorite|favourite|interest|interests|interested in|i love|i enjoy|usually|typically|always|regularly|need|needs|require|requires|must have|budget|under|max(?:imum)?|up to|respond in|reply in|answer in|speak|language|wheelchair|accessible|accessibility|mobility|hearing|vision|allerg|actually|correction|instead|no longer|prefiero|prefiere|normalmente|siempre|presupuesto|responde en|idioma|accesibilidad|interesa|ahora|en realidad|ya no)\b/i;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  'about', 'always', 'with', 'from', 'that', 'this', 'their', 'user', 'prefers',
  'preference', 'requires', 'usually', 'interested', 'respuesta', 'prefiere',
]);
const GROUNDING_BOILERPLATE = new Set([
  'access', 'budget', 'maximum', 'responses', 'response', 'tour', 'tours',
  'travel', 'travels', 'language', 'speaks', 'needs', 'requires', 'usd',
  'bird', 'birds',
]);
const DURABLE_CATEGORY_SIGNALS = {
  preferences: /\b(prefer|prefers|preference|favorite|favourite|usually|typically|always)\b/i,
  accessibility_requirements: /\b(wheelchair|accessible|accessibility|mobility|hearing|vision|allerg|accommodation|accommodate|accesibilidad)\b/i,
  recurring_travel_constraints: /\b(usually|typically|always|regularly|recurring|normalmente|siempre)\b/i,
  bird_interests: /\b(interest|interests|interested|favorite|favourite|love|enjoy|interesa)\b/i,
  preferred_language: /\b(prefer|prefers|preferred|always|usually|language|idioma|prefiero|prefiere)\b/i,
  budget_ranges: /\b(budget|prefer|prefers|maximum|max|usually|typically|presupuesto)\b/i,
};
const EXPLICIT_CORRECTION_PATTERN = /\b(actually|correction|correct that|now prefers?|instead|no longer|changed? (?:my|the)|make it|rather than|ahora|en realidad|ya no|cambi(?:e|é|ar))\b/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function hasLexicalSupport(content, message) {
  const messageTokens = new Set((normalizeText(message).toLowerCase().match(WORD_PATTERN) || []));
  const contentTokens = (normalizeText(content).toLowerCase().match(WORD_PATTERN) || [])
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  const groundedTokens = contentTokens.filter((token) => !GROUNDING_BOILERPLATE.has(token));
  return groundedTokens.length > 0 && groundedTokens.every((token) => messageTokens.has(token));
}

function hasDurableCategorySignal(category, message) {
  return DURABLE_CATEGORY_SIGNALS[category]?.test(normalizeText(message)) === true;
}

function hasExplicitCorrectionSignal(message) {
  return EXPLICIT_CORRECTION_PATTERN.test(normalizeText(message));
}

function normalizeExpiration(value, now = new Date()) {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed <= now) return undefined;
  return parsed.toISOString();
}

function isSafeMemoryContent(content) {
  return Boolean(content)
    && !UNSAFE_CONTENT_PATTERN.test(content)
    && !EMAIL_PATTERN.test(content)
    && !LONG_NUMBER_PATTERN.test(content)
    && !PHONE_PATTERN.test(content)
    && !PRECISE_ADDRESS_PATTERN.test(content);
}

function validateMemoryExtraction(parsed, {
  message,
  existingMemories = [],
  now = new Date(),
} = {}) {
  const validation = UserMemoryExtractionSchema.safeParse(parsed);
  if (!validation.success) {
    return { success: false, code: 'USER_MEMORY_INVALID_OUTPUT' };
  }

  const existingById = new Map(existingMemories.map((memory) => [Number(memory.id), memory]));
  const accepted = [];
  const clarificationRequired = [];

  for (const candidate of validation.data.memories) {
    const content = normalizeText(candidate.content);
    const expiration = normalizeExpiration(candidate.expiresAt, now);
    const groundedAndSafe = candidate.explicitlyStated === true
      && candidate.stable === true
      && candidate.usefulAcrossSessions === true
      && candidate.safeToRetain === true
      && candidate.isUserEditable === true
      && expiration !== undefined
      && isSafeMemoryContent(content)
      && (hasDurableCategorySignal(candidate.category, message)
        || hasExplicitCorrectionSignal(message))
      && hasLexicalSupport(content, message);

    if (!groundedAndSafe) continue;

    const conflictsWithMemoryIds = [...new Set(candidate.conflictsWithMemoryIds)]
      .filter((id) => existingById.get(id)?.category === candidate.category);
    const supersedesMemoryIds = [...new Set(candidate.supersedesMemoryIds)]
      .filter((id) => existingById.get(id)?.category === candidate.category);
    if (conflictsWithMemoryIds.length !== candidate.conflictsWithMemoryIds.length
      || supersedesMemoryIds.length !== candidate.supersedesMemoryIds.length) continue;

    const conflictKey = normalizeText(candidate.conflictKey) || null;
    const explicitCorrection = candidate.conflictResolution === 'explicit_recent_correction'
      && conflictsWithMemoryIds.length > 0
      && conflictKey
      && candidate.confidence >= MIN_EXPLICIT_CORRECTION_CONFIDENCE
      && hasExplicitCorrectionSignal(message)
      && conflictsWithMemoryIds.length === supersedesMemoryIds.length
      && conflictsWithMemoryIds.every((id) => supersedesMemoryIds.includes(id));
    const needsClarification = conflictsWithMemoryIds.length > 0 && (
      candidate.conflictResolution === 'clarification_required'
      || (candidate.conflictResolution === 'explicit_recent_correction' && !explicitCorrection)
    );

    if (needsClarification) {
      if (candidate.confidence >= MIN_CLARIFICATION_CONFIDENCE && conflictKey) {
        clarificationRequired.push({
          category: candidate.category,
          conflictKey,
          conflictsWithMemoryIds,
          proposedContent: content,
          confidence: candidate.confidence,
        });
      }
      continue;
    }

    if (candidate.conflictResolution === 'none'
      && (conflictsWithMemoryIds.length > 0 || supersedesMemoryIds.length > 0)) continue;
    if (candidate.conflictResolution !== 'none' && !explicitCorrection) continue;
    if (candidate.confidence < MIN_MEMORY_CONFIDENCE) continue;

    const duplicate = existingMemories.some((memory) => (
      memory.category === candidate.category
      && normalizeText(memory.content).toLowerCase() === content.toLowerCase()
    ));
    if (duplicate) continue;

    accepted.push({
      category: candidate.category,
      content,
      confidence: candidate.confidence,
      expiresAt: expiration,
      isUserEditable: true,
      conflictKey,
      resolution: explicitCorrection ? 'explicit_recent_correction' : 'none',
      conflictsWithMemoryIds,
      supersedesMemoryIds,
    });
  }

  return { success: true, memories: accepted, clarificationRequired };
}

function shouldExtractUserMemory(message) {
  return MEMORY_SIGNAL_PATTERN.test(normalizeText(message));
}

export class UserMemoryExtractor {
  constructor({
    client = openaiClient,
    log = logger,
    model = getModel(MODEL_REGISTRY, MODEL_KEYS.STRUCTURED_RELIABLE).modelId,
    clock = () => new Date(),
  } = {}) {
    this.client = client;
    this.logger = log;
    this.model = model;
    this.clock = clock;
  }

  async extract({
    message,
    sourceRole = 'user',
    existingMemories = [],
    signal,
    metadata = {},
  } = {}) {
    if (sourceRole !== 'user') {
      return { success: true, memories: [], skipped: true };
    }
    if (!shouldExtractUserMemory(message)) {
      return { success: true, memories: [], skipped: true };
    }

    const existingProjection = existingMemories.slice(0, 50).map((memory) => ({
      id: memory.id,
      category: memory.category,
      content: memory.content,
      confidence: memory.confidence,
      conflictKey: memory.conflictKey,
      createdAt: memory.createdAt,
    }));

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const completion = await this.client.parseStructuredChatCompletion([
          { role: 'system', content: USER_MEMORY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              currentMessage: message,
              existingMemories: existingProjection,
            }),
          },
        ], {
          schema: UserMemoryExtractionSchema,
          schemaName: 'user_memory_extraction',
          model: this.model,
          signal,
          usage: metadata.usage,
          metadata: {
            parentTraceId: metadata.parentTraceId,
            conversationId: metadata.conversationId,
            promptVersion: USER_MEMORY_PROMPT_VERSION,
            operation: 'user_memory_extraction',
          },
        });
        const responseMessage = completion.choices?.[0]?.message;
        if (responseMessage?.refusal) {
          return { success: false, code: 'USER_MEMORY_REFUSED' };
        }
        const result = validateMemoryExtraction(responseMessage?.parsed, {
          message,
          existingMemories,
          now: this.clock(),
        });
        if (result.success || attempt === MAX_ATTEMPTS) return result;
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
        this.logger.warn('User memory extraction failed', {
          attempt,
          code: error.code,
        });
        if (attempt === MAX_ATTEMPTS) {
          return { success: false, code: 'USER_MEMORY_EXTRACTION_FAILED' };
        }
      }
    }

    return { success: false, code: 'USER_MEMORY_EXTRACTION_FAILED' };
  }
}

export {
  MIN_MEMORY_CONFIDENCE,
  MIN_EXPLICIT_CORRECTION_CONFIDENCE,
  MIN_CLARIFICATION_CONFIDENCE,
  hasExplicitCorrectionSignal,
  isSafeMemoryContent,
  normalizeExpiration,
  hasDurableCategorySignal,
  shouldExtractUserMemory,
  validateMemoryExtraction,
};

export default new UserMemoryExtractor();
