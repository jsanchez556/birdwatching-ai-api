import vectorSearchService, {
  cosineSimilarity,
  normalizeVector,
} from '../src/services/vectorSearch.service.js';

describe('VectorSearchService', () => {
  it('calculates cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('normalizes vectors before scoring documents', () => {
    expect(normalizeVector([3, 4])).toEqual([0.6, 0.8]);

    const [result] = vectorSearchService.search([10, 0], [
      { name: 'Resplendent Quetzal', embedding: [5, 0] },
    ]);

    expect(result).toMatchObject({
      name: 'Resplendent Quetzal',
      embedding: [1, 0],
      score: 1,
    });
  });

  it('returns the top matching documents ordered by score', () => {
    const results = vectorSearchService.search([1, 0], [
      { name: 'Keel-billed Toucan', embedding: [0.5, 0.5] },
      { name: 'Resplendent Quetzal', embedding: [1, 0] },
      { name: 'Scarlet Macaw', embedding: [0, 1] },
    ], 2);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'Resplendent Quetzal',
      score: 1,
    });
    expect(results[1].name).toBe('Keel-billed Toucan');
  });
});
