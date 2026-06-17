import { normalizeWhitespace } from '../../utils/text.utils.js';
import { clampScore, roundScore } from './scoring.utils.js';

function normalizeToolCall(call = {}, index) {
  if (typeof call === 'string') {
    return {
      name: normalizeWhitespace(call),
      success: true,
      order: index,
    };
  }

  const name = normalizeWhitespace(call.name || call.tool || call.functionName);

  return {
    name,
    success: call.success !== false && call.error !== true,
    order: Number.isFinite(call.order) ? call.order : index,
  };
}

function normalizeExpectedTool(expected = {}) {
  if (typeof expected === 'string') {
    return {
      name: normalizeWhitespace(expected),
      required: true,
    };
  }

  return {
    name: normalizeWhitespace(expected.name || expected.tool || expected.functionName),
    required: expected.required !== false,
  };
}

export function evaluateToolCorrectness({
  expectedTools = [],
  actualTools = [],
} = {}) {
  const expected = expectedTools.map(normalizeExpectedTool).filter((tool) => tool.name);
  const actual = actualTools.map(normalizeToolCall).filter((tool) => tool.name);
  const actualNames = new Set(actual.map((tool) => tool.name));
  const requiredExpected = expected.filter((tool) => tool.required);
  const matchedExpected = requiredExpected.filter((tool) => actualNames.has(tool.name));
  const unexpectedActual = actual.filter(
    (tool) => !expected.some((expectedTool) => expectedTool.name === tool.name),
  );
  const failedActual = actual.filter((tool) => !tool.success);
  const requiredCoverage = requiredExpected.length
    ? matchedExpected.length / requiredExpected.length
    : 1;
  const precision = actual.length
    ? (actual.length - unexpectedActual.length) / actual.length
    : 1;
  const successRate = actual.length
    ? (actual.length - failedActual.length) / actual.length
    : 1;
  const score = clampScore((requiredCoverage * 0.5) + (precision * 0.25) + (successRate * 0.25));

  return {
    score: roundScore(score),
    requiredCoverage: roundScore(requiredCoverage),
    precision: roundScore(precision),
    successRate: roundScore(successRate),
    reasoning: {
      summary: `${matchedExpected.length} of ${requiredExpected.length} required tools were called, ${unexpectedActual.length} unexpected tools were called, and ${failedActual.length} tool calls failed.`,
    },
    details: {
      expectedTools: expected,
      actualTools: actual,
      missingTools: requiredExpected
        .filter((tool) => !actualNames.has(tool.name))
        .map((tool) => tool.name),
      unexpectedTools: unexpectedActual.map((tool) => tool.name),
      failedTools: failedActual.map((tool) => tool.name),
    },
  };
}

export default evaluateToolCorrectness;
