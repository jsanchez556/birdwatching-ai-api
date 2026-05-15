import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  buildFilterClause,
  default: vectorRepository,
  normalizeKeywordQuery,
  normalizeLimit,
  normalizeSearchWeights,
  toVectorLiteral,
} = await import('../src/db/vector/vector.repository.js');
const { default: pool } = await import('../src/db/pool.js');

describe('VectorRepository helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats vectors for pgvector parameter binding', () => {
    expect(toVectorLiteral([1, 0.5, -2])).toBe('[1,0.5,-2]');
    expect(() => toVectorLiteral([])).toThrow('Embedding vector must be a non-empty array');
  });

  it('normalizes retrieval limits', () => {
    expect(normalizeLimit(undefined)).toBe(3);
    expect(normalizeLimit(50)).toBe(20);
    expect(normalizeLimit(5)).toBe(5);
  });

  it('normalizes keyword queries and hybrid search weights', () => {
    expect(normalizeKeywordQuery('  Quetzal!!! Monteverde?  ')).toBe('Quetzal Monteverde');
    expect(normalizeKeywordQuery('Where can I see quetzals in Monteverde?')).toBe('quetzals Monteverde');
    expect(normalizeKeywordQuery('!!!')).toBeNull();
    expect(normalizeSearchWeights({ semanticWeight: 3, keywordWeight: 1 })).toEqual({
      semanticWeight: 0.75,
      keywordWeight: 0.25,
    });
  });

  it('builds optional metadata and tag filters with placeholders', () => {
    const filter = buildFilterClause({
      active: true,
      source: 'birds.json',
      category: 'Trogonidae',
      title: 'Quetzal',
      location: 'Monteverde',
      tags: ['Monteverde'],
      metadata: { family: 'Trogonidae' },
    });

    expect(filter.clause).toContain('d.active = COALESCE($2::boolean, true)');
    expect(filter.clause).toContain('d.source = $3');
    expect(filter.clause).toContain('LOWER(d.category) = LOWER($4)');
    expect(filter.clause).toContain("d.title ILIKE $5 ESCAPE '\\'");
    expect(filter.clause).toContain("d.metadata->>'locations' ILIKE $6");
    expect(filter.clause).toContain('d.tags && $7::text[]');
    expect(filter.clause).toContain('d.metadata @> $8::jsonb');
    expect(filter.values).toEqual([
      true,
      'birds.json',
      'Trogonidae',
      '%Quetzal%',
      '%Monteverde%',
      ['Monteverde'],
      JSON.stringify({ family: 'Trogonidae' }),
    ]);
  });

  it('keeps search relevance cutoff and limit placeholders aligned', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await vectorRepository.searchSimilar([1, 0], {
      limit: 5,
      minScore: 0.72,
      queryText: 'quetzal monteverde',
      filters: {
        category: 'Trogonidae',
        title: 'Quetzal',
        location: 'Monteverde',
      },
    });

    const [query, values] = pool.query.mock.calls[0];

    expect(query).toContain('LOWER(d.category) = LOWER($3)');
    expect(query).toContain("d.title ILIKE $4 ESCAPE '\\'");
    expect(query).toContain("d.metadata->>'locations' ILIKE $5");
    expect(query).toContain("plainto_tsquery('simple', $6)");
    expect(query).toContain('semantic_score');
    expect(query).toContain('keyword_score');
    expect(query).toContain('ORDER BY score DESC, semantic_score DESC, keyword_score DESC');
    expect(query).toContain('AND score >= $7');
    expect(query).toContain('semantic_score >= $8 OR keyword_score > 0');
    expect(query).toContain('LIMIT $9');
    expect(values).toEqual([
      '[1,0]',
      undefined,
      'Trogonidae',
      '%Quetzal%',
      '%Monteverde%',
      'quetzal monteverde',
      0.72,
      0.15,
      5,
    ]);
  });
});
