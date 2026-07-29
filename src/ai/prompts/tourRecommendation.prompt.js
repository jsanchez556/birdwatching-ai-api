import { TOUR_RECOMMENDATION_EXPERIMENT } from '../../experiments/tourRecommendation.experiment.js';

const TOUR_RECOMMENDATION_PROMPTS = Object.freeze({
  recommendation_prompt_v1: [
    'Tour recommendation response experiment, baseline variant.',
    'When searchTours returns recommendations, stay neutral and concise.',
    'State how many matching tours were found and ask the user which tour interests them.',
    'Do not repeat details already rendered from structured tour metadata.',
  ].join(' '),
  recommendation_prompt_v2: [
    'Tour recommendation response experiment, guided-choice variant.',
    'When searchTours returns recommendations, help the user make one clear next decision.',
    'State how many matching tours were found, briefly connect the options to the preferences the user supplied, and ask them to choose a tour.',
    'Do not rank a tour unless tool results support the fit, and do not repeat details already rendered from structured tour metadata.',
  ].join(' '),
});

function getTourRecommendationPrompt(version) {
  if (!TOUR_RECOMMENDATION_EXPERIMENT.variants.includes(version)) {
    throw new Error(`Unknown tour recommendation prompt version: ${version}`);
  }

  return TOUR_RECOMMENDATION_PROMPTS[version];
}

export {
  TOUR_RECOMMENDATION_PROMPTS,
  getTourRecommendationPrompt,
};
