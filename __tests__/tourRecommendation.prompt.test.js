import {
  TOUR_RECOMMENDATION_PROMPTS,
  getTourRecommendationPrompt,
} from '../src/ai/prompts/tourRecommendation.prompt.js';

describe('tour recommendation prompt experiment', () => {
  it('exposes both named prompt versions', () => {
    expect(Object.keys(TOUR_RECOMMENDATION_PROMPTS)).toEqual([
      'recommendation_prompt_v1',
      'recommendation_prompt_v2',
    ]);
    expect(getTourRecommendationPrompt('recommendation_prompt_v1'))
      .toContain('baseline variant');
    expect(getTourRecommendationPrompt('recommendation_prompt_v2'))
      .toContain('guided-choice variant');
  });

  it('rejects unknown variants', () => {
    expect(() => getTourRecommendationPrompt('recommendation_prompt_v3'))
      .toThrow('Unknown tour recommendation prompt version');
  });
});
