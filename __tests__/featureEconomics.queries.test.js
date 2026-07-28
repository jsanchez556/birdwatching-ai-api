import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const {
  FeatureEconomicsQueries,
} = await import('../src/db/queries/featureEconomics.queries.js');

describe('FeatureEconomicsQueries', () => {
  it('reads economics rows through the database aggregation function', async () => {
    const rows = [{
      bucket_start: '2026-07-01T00:00:00.000Z',
      feature: 'chat',
    }];
    mockQuery.mockResolvedValue({ rows });
    const queries = new FeatureEconomicsQueries();

    await expect(queries.getEconomics({
      granularity: 'daily',
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-02T00:00:00.000Z',
    })).resolves.toBe(rows);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_ai_feature_economics($1, $2, $3)',
      [
        'daily',
        '2026-07-01T00:00:00.000Z',
        '2026-07-02T00:00:00.000Z',
      ]
    );
  });
});
