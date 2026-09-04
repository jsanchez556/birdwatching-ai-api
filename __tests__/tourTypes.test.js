import {
  DEFAULT_TOUR_TYPE,
  isTourType,
  normalizeTourType,
  TOUR_TYPES,
} from '../src/constants/tourTypes.js';

describe('tour types', () => {
  it('exposes and normalizes the canonical customer-facing categories', () => {
    expect(TOUR_TYPES).toEqual([
      'Birdwatching',
      'Day walk',
      'Night walk',
      'Day & Night Walk',
      'Adventure',
      'Excursion',
      'Transfer',
      'Other',
    ]);
    expect(DEFAULT_TOUR_TYPE).toBe('Birdwatching');

    for (const type of TOUR_TYPES) {
      expect(normalizeTourType(type.toLowerCase())).toBe(type);
      expect(isTourType(type)).toBe(true);
    }

    expect(normalizeTourType('Parks')).toBeUndefined();
    expect(isTourType('Parks')).toBe(false);
  });
});
