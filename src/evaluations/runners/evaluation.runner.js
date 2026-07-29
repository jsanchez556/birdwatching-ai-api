import { evaluateResponses } from '../scorers/index.js';

export function runEvaluationDataset({
  dataset = [],
  answersByCaseId = {},
  options = {},
} = {}) {
  const results = evaluateResponses(dataset, answersByCaseId, options);
  const score = results.length
    ? results.reduce((total, result) => total + result.score, 0) / results.length
    : 0;

  return {
    score: Math.round(score * 100) / 100,
    count: results.length,
    results,
  };
}

export default runEvaluationDataset;
