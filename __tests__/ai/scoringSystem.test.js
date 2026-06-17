import {
  average,
  clampScore,
  formatScorePercent,
  roundScore,
  tokenize,
  tokenCoverage,
  uniqueTokens,
} from '../../src/evaluations/scorers/scoring.utils.js';
import { evaluateToolCorrectness } from '../../src/evaluations/scorers/toolCorrectness.scorer.js';

describe('scoring system utilities', () => {
  test('normalizes scores and formats percentages', () => {
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(1.5)).toBe(1);
    expect(roundScore(0.456)).toBe(0.46);
    expect(formatScorePercent(0.914)).toBe('91%');
    expect(average([0.5, 1])).toBe(0.75);
    expect(average([])).toBe(0);
  });

  test('tokenizes comparable text and ignores evaluator filler words', () => {
    expect(tokenize('Where can I see toucans in Costa Rica?')).toEqual([
      'toucan',
      'costa',
      'rica',
    ]);
    expect(uniqueTokens('Toucans, toucans, Costa Rica')).toEqual([
      'toucan',
      'costa',
      'rica',
    ]);
    expect(tokenCoverage(
      'Where can I see toucans?',
      'Toucans are common in Costa Rica rainforest.',
    )).toBe(1);
  });

  test('scores tool correctness for required, unexpected, and failed tools', () => {
    const result = evaluateToolCorrectness({
      expectedTools: ['searchTours', 'checkAvailability'],
      actualTools: [
        'searchTours',
        { name: 'createReservation', success: false },
      ],
    });

    expect(result.score).toBeLessThan(1);
    expect(result.requiredCoverage).toBe(0.5);
    expect(result.precision).toBe(0.5);
    expect(result.successRate).toBe(0.5);
    expect(result.details.missingTools).toEqual(['checkAvailability']);
    expect(result.details.unexpectedTools).toEqual(['createReservation']);
    expect(result.details.failedTools).toEqual(['createReservation']);
  });
});
