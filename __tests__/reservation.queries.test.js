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
        customerName: 'Ana Gomez',
        customerEmail: null,
        conversationId: 'conversation-123',
        tourId: 1,
        participants: 2,
        confirmationCode: 'BW-ABC123',
        createdAt,
        totalPrice: 240,
      },
      tour: expect.objectContaining({
        id: 1,
        name: 'Monteverde Quetzal Tour',
        availableSlots: 3,
      }),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('create_tour_reservation'),
      [1, 2, 'Ana Gomez', null, 'conversation-123', 'BW-ABC123', 0]
    );
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
