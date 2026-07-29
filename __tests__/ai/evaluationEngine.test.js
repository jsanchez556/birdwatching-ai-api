import {
  evaluateResponse,
  evaluateResponses,
} from '../../src/evaluations/scorers/evaluationEngine.scorer.js';

const quetzalCase = {
  id: 'quetzal-location',
  category: 'rag_retrieval',
  question: 'Where can I see quetzals?',
  expectedBehavior: [
    'mentions Monteverde',
    'mentions San Gerardo de Dota',
    'does not guarantee sightings',
  ],
  evaluationCriteria: [
    'Does not require exact phrase matching',
    'Does not invent unavailable tour inventory or reservation details',
  ],
};

describe('evaluation engine', () => {
  test('scores an answer against expected behavior without exact phrase matching', () => {
    const result = evaluateResponse(
      quetzalCase,
      'Look for quetzals around Monteverde and San Gerardo de Dota. These are strong cloud forest options, but sightings are not guaranteed.',
      {
        groundingText: 'Monteverde and San Gerardo de Dota are cloud forest areas where birders look for quetzals.',
      },
    );

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.relevance).toBeGreaterThan(0.7);
    expect(result.grounding).toBeGreaterThan(0.5);
    expect(result.correctness).toBeGreaterThanOrEqual(0.9);
    expect(result.completeness).toBeGreaterThanOrEqual(0.8);
    expect(result.reasoning.summary).toContain('Aggregate score');
    expect(result.details.expectedBehavior).toHaveLength(3);
  });

  test('returns zeroed scores and empty-response reasoning for blank answers', () => {
    const result = evaluateResponse(quetzalCase, '   ');

    expect(result).toMatchObject({
      score: 0,
      relevance: 0,
      grounding: 0,
      correctness: 0,
      completeness: 0,
    });
    expect(result.reasoning.summary).toBe('The response is empty.');
  });

  test('penalizes unsafe unsupported claims in negative expectations', () => {
    const result = evaluateResponse(
      quetzalCase,
      'Monteverde is guaranteed and your reservation is confirmed for $99.',
    );

    const safetyCriterion = result.details.evaluationCriteria.find(
      (criterion) => criterion.criterion.includes('Does not invent'),
    );

    expect(safetyCriterion.score).toBeLessThan(1);
    expect(safetyCriterion.missingTokens).toContain('safety_constraint_violated');
    expect(result.correctness).toBeLessThan(1);
  });

  test('evaluates multiple responses while preserving case metadata', () => {
    const results = evaluateResponses([quetzalCase], {
      'quetzal-location': 'Monteverde and San Gerardo de Dota are good quetzal locations.',
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'quetzal-location',
      category: 'rag_retrieval',
      question: 'Where can I see quetzals?',
    });
    expect(results[0].score).toBeGreaterThan(0);
  });
});
