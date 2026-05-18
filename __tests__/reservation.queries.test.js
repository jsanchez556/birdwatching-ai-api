import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: reservationQueries } = await import('../src/db/queries/reservation.queries.js');

describe('ReservationQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a reservation through the PostgreSQL function', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockQuery.mockResolvedValue({
      rows: [{
        success: true,
        code: null,
        message: null,
        id: 42,
        user_id: null,
        customer_name: 'Ana Gomez',
        customer_email: null,
        conversation_id: 'conversation-123',
        tour_id: 1,
        participants: 2,
        confirmation_code: 'BW-ABC123',
        created_at: createdAt,
        total_price: '240.00',
        tour_name: 'Monteverde Quetzal Tour',
        tour_price: '120.00',
        tour_available_slots: 3,
        tour_location: 'Monteverde',
        tour_duration_hours: 4,
        tour_difficulty: 'moderate',
      }],
    });

    await expect(reservationQueries.createReservation({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
      customerEmail: null,
      conversationId: 'conversation-123',
      confirmationCode: 'BW-ABC123',
      discountRate: 0,
    })).resolves.toEqual({
      success: true,
      reservation: {
        id: 42,
        userId: null,
        customerName: 'Ana Gomez',
        customerEmail: null,
        conversationId: 'conversation-123',
        tourId: 1,
        participants: 2,
        confirmationCode: 'BW-ABC123',
        createdAt,
        totalPrice: 240,
        metadata: {},
      },
      tour: expect.objectContaining({
        id: 1,
        name: 'Monteverde Quetzal Tour',
        availableSlots: 3,
      }),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('create_tour_reservation'),
      [1, 2, 'Ana Gomez', null, 'conversation-123', 'BW-ABC123', 0, null]
    );
  });

  it('passes user ID to the PostgreSQL reservation function', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        success: true,
        id: 50,
        user_id: 7,
        customer_name: 'Ana Gomez',
        customer_email: 'ana@example.com',
        conversation_id: 'conversation-123',
        tour_id: 1,
        participants: 2,
        confirmation_code: 'BW-USER',
        created_at: new Date('2026-05-09T10:00:00.000Z'),
        total_price: '240.00',
        tour_name: 'Monteverde Quetzal Tour',
        tour_price: '120.00',
        tour_available_slots: 3,
        tour_location: 'Monteverde',
        tour_duration_hours: 4,
        tour_difficulty: 'moderate',
        metadata: {
          transportation: {
            transportationOption: 'shared_shuttle',
            totalPrice: 130,
          },
        },
      }],
    });

    await reservationQueries.createReservation({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
      customerEmail: 'ana@example.com',
      conversationId: 'conversation-123',
      confirmationCode: 'BW-USER',
      discountRate: 0,
      userId: 7,
      metadata: {
        transportation: {
          transportationOption: 'shared_shuttle',
          totalPrice: 130,
        },
      },
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('create_tour_reservation'),
      [1, 2, 'Ana Gomez', 'ana@example.com', 'conversation-123', 'BW-USER', 0, 7]
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('loads the latest reservation for an owned conversation', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockQuery.mockResolvedValue({
      rows: [{
        id: 42,
        user_id: 7,
        customer_name: 'Ana Gomez',
        customer_email: 'ana@example.com',
        conversation_id: 'conversation-123',
        tour_id: 1,
        participants: 2,
        confirmation_code: 'BW-ABC123',
        created_at: createdAt,
        total_price: '240.00',
        metadata: {},
        tour_name: 'Monteverde Quetzal Tour',
        tour_price: '120.00',
        tour_available_slots: 3,
        tour_location: 'Monteverde',
        tour_duration_hours: 4,
        tour_difficulty: 'moderate',
      }],
    });

    await expect(reservationQueries.getLatestByConversationId('conversation-123', 7)).resolves.toEqual({
      reservation: expect.objectContaining({
        id: 42,
        userId: 7,
        conversationId: 'conversation-123',
        metadata: {},
      }),
      tour: expect.objectContaining({
        id: 1,
        name: 'Monteverde Quetzal Tour',
      }),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INNER JOIN conversations'),
      ['conversation-123', 7]
    );
    expect(mockQuery.mock.calls[0][0]).not.toContain('r.metadata');
  });

  it('maps insufficient availability returned by the PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        success: false,
        code: 'INSUFFICIENT_AVAILABILITY',
        message: 'La Selva Nightjar Experience has 2 available slots, but 3 were requested.',
        id: null,
        customer_name: null,
        customer_email: null,
        conversation_id: null,
        tour_id: 5,
        participants: 3,
        confirmation_code: null,
        created_at: null,
        total_price: null,
        tour_name: 'La Selva Nightjar Experience',
        tour_price: '135.00',
        tour_available_slots: 2,
        tour_location: 'La Selva Biological Station',
        tour_duration_hours: 3,
        tour_difficulty: 'easy',
      }],
    });

    await expect(reservationQueries.createReservation({
      tourId: 5,
      participants: 3,
      customerName: 'Ana Gomez',
      confirmationCode: 'BW-ABC123',
    })).resolves.toMatchObject({
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
      requestedParticipants: 3,
      availableSlots: 2,
    });
  });
});
