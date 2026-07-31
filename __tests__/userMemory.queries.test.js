import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { error: jest.fn() },
}));

const { default: queries } = await import('../src/db/queries/userMemory.queries.js');

describe('UserMemoryQueries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retrieves active memories through the user-scoped SQL function', async () => {
    mockQuery.mockResolvedValue({ rows: [{
      id: '2',
      user_id: '7',
      category: 'preferred_language',
      content: 'Prefers Spanish responses.',
      confidence: '0.980',
      source_message_id: '42',
      created_at: new Date('2026-07-31T00:00:00Z'),
      expires_at: null,
      is_user_editable: true,
      is_active: true,
      conflict_key: 'response_language',
      resolution: 'none',
    }] });

    await expect(queries.getActive(7, 25)).resolves.toEqual([
      expect.objectContaining({
        id: 2,
        userId: 7,
        sourceMessageId: 42,
        confidence: 0.98,
        isUserEditable: true,
        isActive: true,
        conflictKey: 'response_language',
        resolution: 'none',
      }),
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_active_user_memories($1, $2)',
      [7, 25]
    );
  });

  it('saves provenance, expiry, editability, and explicit supersession IDs', async () => {
    mockQuery.mockResolvedValue({ rows: [{
      id: '3', user_id: '7', category: 'preferred_language',
      content: 'Prefers Spanish responses.', confidence: '0.990',
      source_message_id: '43', created_at: new Date(), expires_at: null,
      is_user_editable: true,
    }] });

    await queries.save({
      userId: 7,
      category: 'preferred_language',
      content: 'Prefers Spanish responses.',
      contentFingerprint: 'a'.repeat(64),
      confidence: 0.99,
      sourceMessageId: 43,
      expiresAt: null,
      isUserEditable: true,
      conflictKey: 'response_language',
      resolution: 'explicit_recent_correction',
      supersedesMemoryIds: [2],
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM save_user_memory_v2($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [7, 'preferred_language', 'Prefers Spanish responses.', 'a'.repeat(64), 0.99, 43, null, true, 'response_language', 'explicit_recent_correction', [2]]
    );
  });

  it('retrieves active and superseded memory history for internal audit', async () => {
    mockQuery.mockResolvedValue({ rows: [{
      id: '2', user_id: '7', category: 'preferences',
      content: 'Prefers morning tours.', confidence: '0.950',
      source_message_id: '41', created_at: new Date(), expires_at: null,
      is_user_editable: true, is_active: false, conflict_key: 'tour_time_preference',
      resolution: 'explicit_recent_correction', superseded_by_id: '3',
      superseded_at: new Date(),
    }] });

    await expect(queries.getHistory(7, 100)).resolves.toEqual([
      expect.objectContaining({
        id: 2,
        isActive: false,
        supersededById: 3,
        resolution: 'explicit_recent_correction',
      }),
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_user_memory_history($1, $2)',
      [7, 100]
    );
  });
});
