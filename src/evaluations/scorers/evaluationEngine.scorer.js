import { normalizeWhitespace } from '../../utils/text.utils.js';
import {
  average,
  clampScore,
  roundScore,
  tokenCoverage,
  tokenize,
  uniqueTokens,
} from './scoring.utils.js';

const DEFAULT_WEIGHTS = Object.freeze({
  relevance: 0.25,
  grounding: 0.25,
  correctness: 0.3,
  completeness: 0.2,
});

const EVALUATOR_ONLY_PATTERNS = [
  /\bexact phrase\b/i,
  /\bexact wording\b/i,
  /\bexact-string\b/i,
  /\bdoes not require\b/i,
];

const NEGATIVE_BEHAVIOR_PATTERNS = [
  /\bdoes not\b/i,
  /\bdo not\b/i,
  /\bavoids?\b/i,
  /\brefuses?\b/i,
  /\bwithout\b/i,
];

const UNSUPPORTED_CLAIM_PATTERNS = [
  /\bguarantee(?:d|s)?\b/i,
  /\bconfirmed\b/i,
  /\bconfirmation\s+(?:number|code|id)\b/i,
  /\breservation\s+(?:is\s+)?(?:confirmed|complete|booked)\b/i,
  /\b(?:final|total)\s+price\b/i,
  /\$\s*\d+/,
  /\b\d+(?:\.\d+)?\s*(?:usd|dollars)\b/i,
];

const NEGATED_UNSUPPORTED_CLAIM_PATTERNS = [
  /\b(?:do\s+not|does\s+not|never|no|not|cannot|can't)\s+guarantee(?:d|s)?\b/i,
  /\b(?:not|never)\s+confirmed\b/i,
  /\b(?:not|never)\s+(?:complete|booked)\b/i,
];

function hasNegativeBehavior(value) {
  return NEGATIVE_BEHAVIOR_PATTERNS.some((pattern) => pattern.test(value));
}

function hasUnsupportedClaim(value) {
  const withoutNegatedClaims = NEGATED_UNSUPPORTED_CLAIM_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ' '),
    String(value || ''),
  );

  return UNSUPPORTED_CLAIM_PATTERNS.some((pattern) => pattern.test(withoutNegatedClaims));
}

function isEvaluatorOnlyCriterion(value) {
  return EVALUATOR_ONLY_PATTERNS.some((pattern) => pattern.test(value));
}

function scoreExpectation(expectation, answer) {
  const expectedTokens = uniqueTokens(expectation);

  if (!expectedTokens.length) {
    return {
      expectation,
      score: 0,
      matchedTokens: [],
      missingTokens: [],
    };
  }

  const answerTokens = new Set(tokenize(answer));
  const matchedTokens = expectedTokens.filter((token) => answerTokens.has(token));
  const coverage = matchedTokens.length / expectedTokens.length;
  const negativeExpectation = hasNegativeBehavior(expectation);
  const score = negativeExpectation && hasUnsupportedClaim(answer)
    ? Math.min(coverage, 0.35)
    : coverage;

  return {
    expectation,
    score: clampScore(score),
    matchedTokens,
    missingTokens: expectedTokens.filter((token) => !answerTokens.has(token)),
  };
}

function scoreCriterion(criterion, answer, expectationCoverage) {
  if (isEvaluatorOnlyCriterion(criterion)) {
    return {
      expectation: criterion,
      score: 1,
      matchedTokens: [],
      missingTokens: [],
    };
  }

  if (hasNegativeBehavior(criterion)) {
    const score = hasUnsupportedClaim(answer) ? 0.25 : 1;

    return {
      expectation: criterion,
      score,
      matchedTokens: score === 1 ? ['safety_constraint_satisfied'] : [],
      missingTokens: score === 1 ? [] : ['safety_constraint_violated'],
    };
  }

  const criterionScore = scoreExpectation(criterion, answer);
  const score = Math.max(criterionScore.score, expectationCoverage);

  return {
    ...criterionScore,
    score,
    matchedTokens: criterionScore.score >= expectationCoverage
      ? criterionScore.matchedTokens
      : ['expected_behavior_coverage'],
    missingTokens: criterionScore.score >= expectationCoverage
      ? criterionScore.missingTokens
      : [],
  };
}

function normalizeCase(evaluationCase) {
  return {
    question: normalizeWhitespace(evaluationCase?.question),
    expectedBehavior: Array.isArray(evaluationCase?.expectedBehavior)
      ? evaluationCase.expectedBehavior.map(normalizeWhitespace).filter(Boolean)
      : [],
    evaluationCriteria: Array.isArray(evaluationCase?.evaluationCriteria)
      ? evaluationCase.evaluationCriteria.map(normalizeWhitespace).filter(Boolean)
      : [],
  };
}

function buildReasoning({
  relevance,
  grounding,
  correctness,
  completeness,
  score,
  expectedScores,
  criterionScores,
  hasAnswer,
  hasGroundingText,
}) {
  if (!hasAnswer) {
    return {
      relevance: 'No answer was provided, so it cannot be evaluated against the user question.',
      grounding: 'No answer was provided, so grounding cannot be established.',
      correctness: 'No answer was provided, so expected behavior cannot be satisfied.',
      completeness: 'No answer was provided, so required behavior is incomplete.',
      summary: 'The response is empty.',
    };
  }

  const coveredExpectations = expectedScores
    .filter((item) => item.score >= 0.5)
    .length;
  const coveredCriteria = criterionScores
    .filter((item) => item.score >= 0.5)
    .length;

  return {
    relevance: `Question and expected-behavior overlap produced a relevance score of ${roundScore(relevance)}.`,
    grounding: hasGroundingText
      ? `Answer overlap with supplied grounding text produced a grounding score of ${roundScore(grounding)}.`
      : `No grounding text was supplied, so grounding falls back to expected-behavior coverage at ${roundScore(grounding)}.`,
    correctness: `${coveredCriteria} of ${criterionScores.length} evaluation criteria were substantially reflected, for a correctness score of ${roundScore(correctness)}.`,
    completeness: `${coveredExpectations} of ${expectedScores.length} expected behaviors were substantially reflected, for a completeness score of ${roundScore(completeness)}.`,
    summary: `Aggregate score is ${roundScore(score)}.`,
  };
}

export function evaluateResponse(evaluationCase, answer, options = {}) {
  const normalizedCase = normalizeCase(evaluationCase);
  const normalizedAnswer = normalizeWhitespace(answer);
  const groundingText = normalizeWhitespace(options.groundingText || options.context || '');
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...options.weights,
  };
  const hasAnswer = normalizedAnswer.length > 0;
  const expectedScores = normalizedCase.expectedBehavior
    .map((expectation) => scoreExpectation(expectation, normalizedAnswer));
  const expectationCoverage = average(expectedScores.map((item) => item.score));
  const criterionScores = normalizedCase.evaluationCriteria
    .map((criterion) => scoreCriterion(criterion, normalizedAnswer, expectationCoverage));
  const criteriaCoverage = average(criterionScores.map((item) => item.score));
  const questionCoverage = tokenCoverage(normalizedCase.question, normalizedAnswer);
  const relevance = hasAnswer
    ? clampScore((questionCoverage * 0.35) + (expectationCoverage * 0.65))
    : 0;
  const grounding = hasAnswer && groundingText
    ? tokenCoverage(normalizedAnswer, groundingText)
    : expectationCoverage;
  const correctness = hasAnswer
    ? clampScore((criteriaCoverage * 0.6) + (expectationCoverage * 0.4))
    : 0;
  const completeness = hasAnswer ? expectationCoverage : 0;
  const score = (
    relevance * weights.relevance
    + grounding * weights.grounding
    + correctness * weights.correctness
    + completeness * weights.completeness
  );

  return {
    score: roundScore(score),
    relevance: roundScore(relevance),
    grounding: roundScore(grounding),
    correctness: roundScore(correctness),
    completeness: roundScore(completeness),
    reasoning: buildReasoning({
      relevance,
      grounding,
      correctness,
      completeness,
      score,
      expectedScores,
      criterionScores,
      hasAnswer,
      hasGroundingText: Boolean(groundingText),
    }),
    details: {
      expectedBehavior: expectedScores.map((item) => ({
        expectation: item.expectation,
        score: roundScore(item.score),
        matchedTokens: item.matchedTokens,
        missingTokens: item.missingTokens,
      })),
      evaluationCriteria: criterionScores.map((item) => ({
        criterion: item.expectation,
        score: roundScore(item.score),
        matchedTokens: item.matchedTokens,
        missingTokens: item.missingTokens,
      })),
    },
  };
}

export function evaluateResponses(evaluationCases, answersByCaseId, options = {}) {
  const cases = Array.isArray(evaluationCases) ? evaluationCases : [];

  return cases.map((evaluationCase) => {
    const answer = answersByCaseId?.[evaluationCase.id] ?? '';

    return {
      id: evaluationCase.id,
      category: evaluationCase.category,
      question: evaluationCase.question,
      ...evaluateResponse(evaluationCase, answer, options),
    };
  });
}

export default evaluateResponse;
