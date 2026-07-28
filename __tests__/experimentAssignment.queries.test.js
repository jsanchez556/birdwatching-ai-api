import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const {
  ExperimentAssignmentQueries,
} = await import('../src/db/queries/experimentAssignment.queries.js');

describe('experiment assignment queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads and atomically assigns variants through database functions', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          experiment_key: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v1',
          assigned_at: '2026-07-27T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          experiment_key: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v1',
          assigned_at: '2026-07-27T00:00:00.000Z',
        }],
      });
    const queries = new ExperimentAssignmentQueries();

    await expect(queries.get({
      userId: 7,
      experiment: 'tour_recommendation_prompt',
    })).resolves.toMatchObject({
      variant: 'recommendation_prompt_v1',
    });
    await expect(queries.assign({
      userId: 7,
      experiment: 'tour_recommendation_prompt',
      variant: 'recommendation_prompt_v2',
    })).resolves.toMatchObject({
      variant: 'recommendation_prompt_v1',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM get_user_experiment_assignment($1, $2)',
      [7, 'tour_recommendation_prompt']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM assign_user_experiment_variant($1, $2, $3)',
      [7, 'tour_recommendation_prompt', 'recommendation_prompt_v2']
    );
  });
});
