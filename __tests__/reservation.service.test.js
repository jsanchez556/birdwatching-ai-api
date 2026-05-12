import { jest } from '@jest/globals';

const mockGetTourById = jest.fn();
const mockGetAvailableTours = jest.fn();
const mockCreateReservation = jest.fn();

await jest.unstable_mockModule('../src/db/queries/reservation.queries.js', () => ({
  default: {
    createReservation: mockCreateReservation,
  },
}));

await jest.unstable_mockModule('../src/db/queries/tour.queries.js', () => ({
  default: {
    getAvailableTours: mockGetAvailableTours,
    getTourById: mockGetTourById,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: reservationService } = await import('../src/services/reservation.service.js');

describe('ReservationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checks tour availability from PostgreSQL state', async () => {
    mockGetTourById.mockResolvedValue({
      id: 1,
      name: 'Monteverde Quetzal Tour',
      price: 120,
      availableSlots: 5,
      location: 'Monteverde',
      durationHours: 4,
      difficulty: 'moderate',
    });

    await expect(reservationService.checkTourAvailability({ tourId: 1 })).resolves.toMatchObject({
      success: true,
      tourId: 1,
      availableSlots: 5,
      isAvailable: true,
    });
    expect(mockGetTourById).toHaveBeenCalledWith(1);
  });

  it('calculates prices with discounts', async () => {
    mockGetTourById.mockResolvedValue({
      id: 2,
      name: 'Sarapiqui Rainforest Tour',
      price: 95,
      availableSlots: 3,
      location: 'Sarapiqui',
      durationHours: 5,
      difficulty: 'easy',
    });

    await expect(reservationService.calculateTourPrice({
      tourId: 2,
      participants: 4,
    })).resolves.toMatchObject({
      success: true,
      subtotal: 380,
      discountRate: 0.1,
      discountAmount: 38,
      totalPrice: 342,
      currency: 'USD',
    });
  });

  it('creates durable reservation results with required confirmation fields', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockGetTourById.mockResolvedValue({
      id: 1,
      name: 'Monteverde Quetzal Tour',
      price: 120,
      availableSlots: 5,
      location: 'Monteverde',
      durationHours: 4,
      difficulty: 'moderate',
    });
    mockCreateReservation.mockResolvedValue({
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
      tour: {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        availableSlots: 3,
      },
    });

    const result = await reservationService.createReservation({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
      conversationId: 'conversation-123',
    });

    expect(result).toMatchObject({
      success: true,
      id: 42,
      customer_name: 'Ana Gomez',
      conversationId: 'conversation-123',
      tour_id: 1,
      participants: 2,
      confirmation_code: 'BW-ABC123',
      created_at: createdAt,
      total_price: 240,
      totalPrice: 240,
      remainingSlots: 3,
    });
    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
      customerEmail: null,
      conversationId: 'conversation-123',
      discountRate: 0,
      confirmationCode: expect.stringMatching(/^BW-/),
    }));
  });

  it('creates a Cerro de la Muerte reservation by location when no tour ID is provided', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 10,
        name: 'Cerro de la Muerte Timberline Tour',
        price: 165,
        availableSlots: 4,
        location: 'Cerro de la Muerte',
        durationHours: 6,
        difficulty: 'challenging',
      },
    ]);
    mockCreateReservation.mockResolvedValue({
      success: true,
      reservation: {
        id: 44,
        customerName: 'Ana Gomez',
        customerEmail: null,
        conversationId: 'conversation-123',
        tourId: 10,
        participants: 2,
        confirmationCode: 'BW-CERRO',
        createdAt,
        totalPrice: 330,
      },
      tour: {
        id: 10,
        name: 'Cerro de la Muerte Timberline Tour',
        availableSlots: 2,
      },
    });

    const result = await reservationService.createReservation({
      location: 'Cerro de la Muerte',
      participants: 2,
      customerName: 'Ana Gomez',
      conversationId: 'conversation-123',
    });

    expect(result).toMatchObject({
      success: true,
      tourId: 10,
      tourName: 'Cerro de la Muerte Timberline Tour',
      participants: 2,
      remainingSlots: 2,
    });
    expect(mockGetAvailableTours).toHaveBeenCalledWith({
      location: 'Cerro de la Muerte',
      minSlots: 2,
    });
    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      tourId: 10,
      participants: 2,
      customerName: 'Ana Gomez',
      discountRate: 0,
    }));
  });

  it('rejects a mismatched tour ID and location instead of reserving the wrong tour', async () => {
    mockGetTourById.mockResolvedValue({
      id: 5,
      name: 'La Selva Nightjar Experience',
      price: 135,
      availableSlots: 2,
      location: 'La Selva Biological Station',
      durationHours: 3,
      difficulty: 'easy',
    });

    await expect(reservationService.createReservation({
      tourId: 5,
      location: 'Cerro de la Muerte',
      participants: 2,
      customerName: 'Ana Gomez',
    })).resolves.toMatchObject({
      success: false,
      code: 'TOUR_SELECTION_MISMATCH',
    });
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  it('passes metadata conversation ID into reservation persistence', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockGetTourById.mockResolvedValue({
      id: 1,
      name: 'Monteverde Quetzal Tour',
      price: 120,
      availableSlots: 5,
      location: 'Monteverde',
      durationHours: 4,
      difficulty: 'moderate',
    });
    mockCreateReservation.mockResolvedValue({
      success: true,
      reservation: {
        id: 43,
        customerName: 'Ana Gomez',
        customerEmail: null,
        conversationId: 'conversation-456',
        tourId: 1,
        participants: 2,
        confirmationCode: 'BW-ABC124',
        createdAt,
        totalPrice: 240,
      },
      tour: {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        availableSlots: 3,
      },
    });

    await reservationService.createReservation({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
    }, {
      conversationId: 'conversation-456',
    });

    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-456',
    }));
  });

  it('returns structured validation errors', async () => {
    await expect(reservationService.createReservation({
      tourId: 1,
      participants: 0,
      customerName: 'Ana Gomez',
    })).resolves.toEqual({
      success: false,
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'participants must be a positive integer',
    });
  });
});
