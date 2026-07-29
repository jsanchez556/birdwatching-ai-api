import { FEATURE_FLAGS } from '../featureFlags/flags.js';

const TOUR_RECOMMENDATION_EXPERIMENT = Object.freeze({
  key: 'tour_recommendation_prompt',
  flag: FEATURE_FLAGS.TOUR_RECOMMENDATION_PROMPT,
  metadataKey: 'tourRecommendation',
  defaultVariant: 'recommendation_prompt_v1',
  variants: Object.freeze([
    'recommendation_prompt_v1',
    'recommendation_prompt_v2',
  ]),
});

function normalizeTourRecommendationAssignment(value) {
  const assignment = value?.experimentAssignments?.[TOUR_RECOMMENDATION_EXPERIMENT.metadataKey]
    || value?.[TOUR_RECOMMENDATION_EXPERIMENT.metadataKey]
    || value;

  if (
    assignment?.experiment !== TOUR_RECOMMENDATION_EXPERIMENT.key
    || !TOUR_RECOMMENDATION_EXPERIMENT.variants.includes(assignment.variant)
  ) {
    return null;
  }

  return {
    experiment: TOUR_RECOMMENDATION_EXPERIMENT.key,
    variant: assignment.variant,
  };
}

function getTourRecommendationEventProperties(metadata = {}) {
  const assignment = normalizeTourRecommendationAssignment(metadata);

  return assignment
    ? {
      experiment: assignment.experiment,
      variant: assignment.variant,
    }
    : {};
}

export {
  TOUR_RECOMMENDATION_EXPERIMENT,
  getTourRecommendationEventProperties,
  normalizeTourRecommendationAssignment,
};
