import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: userQueries } = await import('../src/db/queries/user.queries.js');
const { default: refreshTokenQueries } = await import('../src/db/queries/refreshToken.queries.js');

describe('authentication persistence query adapters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates users through the database write contract', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3, email: 'person@example.test' }] });

    await userQueries.create({
      email: 'person@example.test',
      name: 'Person',
      passwordHash: 'hash',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('create_user($1, $2, $3)'),
      ['person@example.test', 'Person', 'hash']
    );
    expect(mockQuery.mock.calls[0][0]).not.toContain('INSERT INTO users');
  });

  it('creates and revokes refresh tokens through database write contracts', async () => {
    const expiresAt = new Date('2026-09-01T00:00:00.000Z');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 4, user_id: 3 }] });
    await refreshTokenQueries.create({ userId: 3, tokenHash: 'token-hash', expiresAt });
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('create_refresh_token($1, $2, $3)'),
      [3, 'token-hash', expiresAt]
    );

    mockQuery.mockResolvedValueOnce({ rows: [{ revoked: true }] });
    await refreshTokenQueries.revokeByHash('token-hash');
    expect(mockQuery).toHaveBeenLastCalledWith(
      'SELECT revoke_refresh_token($1) AS revoked',
      ['token-hash']
    );
  });
});
