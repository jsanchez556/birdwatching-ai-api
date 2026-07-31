import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn() },
}));

const { ReservationStateQueries } = await import('../src/db/queries/reservationState.queries.js');

describe('ReservationStateQueries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the expected version and complete next state to the atomic mutation function', async () => {
    mockQuery.mockResolvedValue({ rows: [{
      conversation_id: 1,
      version: 3,
      status: 'collecting_information',
      proposed_values: { participants: 4 },
      confirmed_values: { participants: 3 },
    }] });
    const queries = new ReservationStateQueries();

    await queries.mutate({
      conversationId: 'conversation-1',
      userId: 7,
      expectedVersion: 2,
      proposed: { participants: 4 },
      confirmed: { participants: 3 },
      status: 'collecting_information',
      eventType: 'values_proposed',
      changedFields: ['participants'],
      sourceType: 'user_message',
      sourceId: 'message-2',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('mutate_reservation_conversation_state'),
      [
        'conversation-1', 7, 2,
        '{"participants":4}', '{"participants":3}',
        'collecting_information', 'values_proposed', ['participants'],
        'user_message', 'message-2',
      ]
    );
  });

  it('delegates booking to the version-checking database function', async () => {
    mockQuery.mockResolvedValue({ rows: [{ result: { success: true, state_version: 6 } }] });
    const queries = new ReservationStateQueries();

    await expect(queries.book({
      conversationId: 'conversation-1',
      userId: 7,
      expectedVersion: 5,
      confirmationCode: 'BW-1',
      discountRate: 0.1,
      idempotencyKey: 'conversation-1:5',
      sourceType: 'booking_tool',
      sourceId: 'request-1',
    })).resolves.toEqual({ success: true, state_version: 6 });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('book_reservation_from_state'),
      ['conversation-1', 7, 5, 'BW-1', 0.1, 'conversation-1:5', 'booking_tool', 'request-1']
    );
  });
});
