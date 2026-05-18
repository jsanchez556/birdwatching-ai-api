import { normalizeTextOrEmpty } from '../../utils/normalizers.js';

const PROMPT_EXTRACTION_PATTERNS = [
  /\b(ignore|disregard|override)\b[\s\S]{0,80}\b(previous|prior|system|developer)\b[\s\S]{0,80}\b(instruction|instructions|prompt|message|messages)\b/i,
  /\b(reveal|show|print|display|repeat|dump|share|tell me)\b[\s\S]{0,80}\b(system|developer|hidden|internal)\b[\s\S]{0,80}\b(prompt|instruction|instructions|message|messages)\b/i,
  /\bwhat\b[\s\S]{0,40}\b(system|developer|hidden|internal)\b[\s\S]{0,40}\b(prompt|instruction|instructions|message|messages)\b/i,
  /\bact as\b[\s\S]{0,40}\b(system|developer)\b/i,
];

const SENSITIVE_OUTPUT_PATTERNS = [
  /\b(system|developer|hidden|internal)\s+(prompt|instruction|instructions|message|messages)\b/i,
  /\bOPENAI_API_KEY\b/i,
  /\bDATABASE_URL\b/i,
  /\bstack trace\b/i,
  /\braw tool response\b/i,
];

const INPUT_REFUSAL_RESPONSE = 'I can help with Costa Rica birdwatching, tours, pricing, or reservations, but I cannot reveal or override internal instructions.';
const OUTPUT_FALLBACK_RESPONSE = 'I can help with Costa Rica birdwatching, tours, pricing, or reservations. Could you rephrase what you would like to do next?';

function matchesAnyPattern(value, patterns) {
  return patterns.find((pattern) => pattern.test(value));
}

export function assessChatInput(message) {
  const normalizedMessage = normalizeTextOrEmpty(message);
  const matchedPattern = matchesAnyPattern(normalizedMessage, PROMPT_EXTRACTION_PATTERNS);

  if (!matchedPattern) {
    return {
      allowed: true,
    };
  }

  return {
    allowed: false,
    code: 'PROMPT_EXTRACTION_BLOCKED',
    reason: 'User requested hidden or internal prompt instructions.',
    response: INPUT_REFUSAL_RESPONSE,
  };
}

export function applyChatOutputGuardrails(response) {
  const normalizedResponse = normalizeTextOrEmpty(response);
  const matchedPattern = matchesAnyPattern(normalizedResponse, SENSITIVE_OUTPUT_PATTERNS);

  if (!matchedPattern) {
    return {
      blocked: false,
      response,
    };
  }

  return {
    blocked: true,
    code: 'SENSITIVE_AI_OUTPUT_BLOCKED',
    reason: 'AI response appeared to expose internal instructions or sensitive implementation details.',
    response: OUTPUT_FALLBACK_RESPONSE,
  };
}
