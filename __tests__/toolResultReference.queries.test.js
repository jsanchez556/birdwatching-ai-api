import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { ToolResultReferenceQueries } = await import(
  '../src/db/queries/toolResultReference.queries.js'
);

describe('ToolResultReferenceQueries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the complete JSON result with scope and expiration', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        reference_id: 'search_tours_ref',
        tool_name: 'searchTours',
        total_count: 47,
        created_at: '2026-08-01T00:00:00Z',
        expires_at: '2026-08-08T00:00:00Z',
      }],
    });
    const queries = new ToolResultReferenceQueries();
    const result = { tours: [{ tourId: 1, internalMargin: 0.32 }] };

    await expect(queries.save({
      referenceId: 'search_tours_ref',
      conversationId: 'conversation-123',
      userId: 7,
      toolName: 'searchTours',
      result,
      total: 47,
      expiresAt: '2026-08-08T00:00:00Z',
    })).resolves.toEqual(expect.objectContaining({
      referenceId: 'search_tours_ref',
      total: 47,
    }));
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM save_tool_result_reference($1, $2, $3, $4, $5, $6, $7)',
      [
        'search_tours_ref',
        'conversation-123',
        7,
        'searchTours',
        JSON.stringify(result),
        47,
        '2026-08-08T00:00:00Z',
      ]
    );
  });

  it('uses reference, conversation, and user scope for retrieval', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const queries = new ToolResultReferenceQueries();

    await expect(queries.get({
      referenceId: 'search_tours_ref',
      conversationId: 'conversation-123',
      userId: 7,
    })).resolves.toBeNull();
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_tool_result_reference($1, $2, $3)',
      ['search_tours_ref', 'conversation-123', 7]
    );
  });
});

