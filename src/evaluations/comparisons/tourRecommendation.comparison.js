import { TOUR_RECOMMENDATION_PROMPTS } from '../../ai/prompts/tourRecommendation.prompt.js';
import { runLangSmithEvaluation } from '../runners/langSmithEvaluation.runner.js';

async function runTourRecommendationPromptExperiment({
  dataset = [],
  executePrompt,
  expectedRelevantChunksByCaseId = {},
  expectedToolsByCaseId = {},
  options = {},
  service,
} = {}) {
  return runLangSmithEvaluation({
    prompts: TOUR_RECOMMENDATION_PROMPTS,
    dataset,
    executePrompt,
    expectedRelevantChunksByCaseId,
    expectedToolsByCaseId,
    options: {
      name: 'Tour recommendation prompt experiment',
      ...options,
    },
    ...(service ? { service } : {}),
  });
}

export {
  runTourRecommendationPromptExperiment,
};
export default runTourRecommendationPromptExperiment;
