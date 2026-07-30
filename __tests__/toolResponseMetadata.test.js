import { describe, expect, it } from '@jest/globals';
import { appendToolResponseMetadata } from '../src/ai/tools/toolResponseMetadata.js';

describe('tool response recommendation metadata', () => {
  it('marks only recommendation-mode tour searches for the structured contract', () => {
    const recommendationMetadata = {};
    const listingMetadata = {};
    const result = {
      success: true,
      tours: [],
    };

    appendToolResponseMetadata(
      recommendationMetadata,
      'searchTours',
      result,
      { recommend: true }
    );
    appendToolResponseMetadata(
      listingMetadata,
      'searchTours',
      result,
      { recommend: false }
    );

    expect(recommendationMetadata.tourRecommendationRequested).toBe(true);
    expect(listingMetadata.tourRecommendationRequested).toBeUndefined();
  });
});
