import { describe, expect, it } from '@jest/globals';
import { TourRecommendationSchema } from '../src/ai/schemas/tourRecommendation.schema.js';
import {
  availabilityStatus,
  buildTourRecommendation,
} from '../src/ai/services/tourRecommendation.service.js';

const supportedTour = {
  tourId: 12,
  name: 'Monteverde Quetzal Tour',
  location: 'Monteverde',
  pricePerPerson: 120,
  availableSlots: 6,
  recommendationScore: 14,
  reasons: ['Matches Monteverde', 'Fits moderate budget'],
};

describe('tour recommendation structured contract', () => {
  it('validates a complete structured recommendation', () => {
    const result = buildTourRecommendation({
      summary: 'I found one supported match.',
      tours: [supportedTour],
      followUpQuestion: 'Which tour interests you?',
    });

    expect(result).toEqual({
      summary: 'I found one supported match.',
      recommendations: [{
        tourId: '12',
        tourName: 'Monteverde Quetzal Tour',
        type: 'Birdwatching',
        location: 'Monteverde',
        estimatedPrice: { amount: 120, currency: 'USD' },
        matchReasons: ['Matches Monteverde', 'Fits moderate budget'],
        availabilityStatus: 'available',
        confidence: 0.7368,
      }],
      sources: [],
      assumptions: [],
      followUpQuestion: 'Which tour interests you?',
    });
  });

  it('supports multiple and empty recommendation lists', () => {
    const multiple = buildTourRecommendation({
      summary: 'I found two supported matches.',
      tours: [
        supportedTour,
        {
          ...supportedTour,
          tourId: 13,
          name: 'Curi-Cancha Morning Walk',
          availableSlots: 2,
        },
      ],
    });
    const empty = buildTourRecommendation({
      summary: 'I could not find a supported match.',
      tours: [],
    });

    expect(multiple.recommendations).toHaveLength(2);
    expect(multiple.recommendations[1].availabilityStatus).toBe('limited');
    expect(empty.recommendations).toEqual([]);
    expect(empty.followUpQuestion).toBeNull();
  });

  it('represents unknown price and availability explicitly', () => {
    const result = buildTourRecommendation({
      summary: 'I found one match with details still to confirm.',
      tours: [{
        ...supportedTour,
        pricePerPerson: null,
        availableSlots: null,
      }],
    });

    expect(result.recommendations[0]).toMatchObject({
      estimatedPrice: { amount: null, currency: null },
      availabilityStatus: 'unknown',
    });
    expect(availabilityStatus(0)).toBe('unavailable');
  });

  it.each([
    ['confidence above one', {
      ...buildTourRecommendation({
        summary: 'Supported matches.',
        tours: [supportedTour],
      }),
      recommendations: [{
        ...buildTourRecommendation({
          summary: 'Supported matches.',
          tours: [supportedTour],
        }).recommendations[0],
        confidence: 1.1,
      }],
    }],
    ['missing tour identifier', {
      summary: 'Supported matches.',
      recommendations: [{
        tourName: 'Tour',
        location: 'Monteverde',
        estimatedPrice: { amount: 10, currency: 'USD' },
        matchReasons: ['Matches location'],
        availabilityStatus: 'available',
        confidence: 0.5,
      }],
      sources: [],
      assumptions: [],
      followUpQuestion: null,
    }],
    ['invalid ISO currency code', {
      summary: 'Supported matches.',
      recommendations: [{
        tourId: '1',
        tourName: 'Tour',
        location: 'Monteverde',
        estimatedPrice: { amount: 10, currency: '$' },
        matchReasons: ['Matches location'],
        availabilityStatus: 'available',
        confidence: 0.5,
      }],
      sources: [],
      assumptions: [],
      followUpQuestion: null,
    }],
    ['empty match reasons', {
      summary: 'Supported matches.',
      recommendations: [{
        tourId: '1',
        tourName: 'Tour',
        location: 'Monteverde',
        estimatedPrice: { amount: 10, currency: 'USD' },
        matchReasons: [],
        availabilityStatus: 'available',
        confidence: 0.5,
      }],
      sources: [],
      assumptions: [],
      followUpQuestion: null,
    }],
  ])('rejects %s', (_label, candidate) => {
    expect(TourRecommendationSchema.safeParse(candidate).success).toBe(false);
  });

  it('fails safely instead of returning partially valid recommendations', () => {
    expect(() => buildTourRecommendation({
      summary: 'I found matches.',
      tours: [
        supportedTour,
        { ...supportedTour, tourId: undefined },
      ],
    })).toThrow('Unable to validate tour recommendations');

    try {
      buildTourRecommendation({
        summary: 'I found matches.',
        tours: [{ ...supportedTour, recommendationScore: -1 }],
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PROVIDER_MALFORMED_RESPONSE',
        status: 502,
      });
    }
  });
});
