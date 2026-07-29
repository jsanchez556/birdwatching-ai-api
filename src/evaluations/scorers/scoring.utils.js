import { cleanComparableText } from '../../utils/text.utils.js';

const STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'an',
  'and',
  'answer',
  'are',
  'as',
  'ask',
  'asks',
  'assistant',
  'available',
  'be',
  'before',
  'bird',
  'by',
  'can',
  'case',
  'claim',
  'claims',
  'context',
  'data',
  'detail',
  'details',
  'do',
  'does',
  'enough',
  'exact',
  'for',
  'frame',
  'frames',
  'from',
  'guidance',
  'if',
  'in',
  'input',
  'is',
  'it',
  'keeps',
  'mention',
  'mentions',
  'multiple',
  'may',
  'needed',
  'not',
  'of',
  'or',
  'platform',
  'provided',
  'question',
  'raw',
  'required',
  'requires',
  'response',
  'see',
  'should',
  'the',
  'them',
  'to',
  'tour',
  'tours',
  'unavailable',
  'unsupported',
  'user',
  'uses',
  'when',
  'where',
  'with',
  'without',
]);

export function clampScore(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function roundScore(value) {
  return Math.round(clampScore(value) * 100) / 100;
}

export function formatScorePercent(value) {
  return `${Math.round(clampScore(value) * 100)}%`;
}

export function tokenize(value) {
  const normalized = cleanComparableText(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .map((token) => (token.length > 4 ? token.replace(/s$/, '') : token))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}

export function tokenCoverage(sourceText, targetText) {
  const sourceTokens = uniqueTokens(sourceText);

  if (!sourceTokens.length) {
    return 0;
  }

  const targetTokens = new Set(tokenize(targetText));
  const matchedCount = sourceTokens
    .filter((token) => targetTokens.has(token))
    .length;

  return matchedCount / sourceTokens.length;
}

export function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}
