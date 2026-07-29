import { jest } from '@jest/globals';

const mockRunLangSmithEvaluation = jest.fn().mockResolvedValue({
  comparison: {
    winner: 'recommendation_prompt_v2',
  },
});

await jest.unstable_mockModule('../src/evaluations/runners/langSmithEvaluation.runner.js', () => ({
  runLangSmithEvaluation: mockRunLangSmithEvaluation,
}));

const {
  runTourRecommendationPromptExperiment,
} = await import('../src/evaluations/comparisons/tourRecommendation.comparison.js');

describe('tour recommendation experiment evaluation', () => {
  it('compares both prompt versions with LangSmith evaluation metrics', async () => {
    const executePrompt = jest.fn();
    const dataset = [{ id: 'tour-1', question: 'Recommend a tour' }];

    await expect(runTourRecommendationPromptExperiment({
      dataset,
      executePrompt,
    })).resolves.toEqual({
      comparison: {
        winner: 'recommendation_prompt_v2',
      },
    });

    expect(mockRunLangSmithEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      prompts: {
        recommendation_prompt_v1: expect.any(String),
        recommendation_prompt_v2: expect.any(String),
      },
      dataset,
      executePrompt,
      options: {
        name: 'Tour recommendation prompt experiment',
      },
    }));
  });
});
