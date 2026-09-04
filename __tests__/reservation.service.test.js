import { jest } from '@jest/globals';

const mockGetTourById = jest.fn();
const mockGetAvailableTours = jest.fn();
const mockCreateReservation = jest.fn();
const mockGetLatestByConversationId = jest.fn();
const mockAnalyticsTrack = jest.fn();

await jest.unstable_mockModule('../src/analytics/analytics.service.js', () => ({
  default: {
    track: mockAnalyticsTrack,
  },
}));

await jest.unstable_mockModule('../src/db/queries/reservation.queries.js', () => ({
  default: {
    createReservation: mockCreateReservation,
    getLatestByConversationId: mockGetLatestByConversationId,
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

const {
  default: reservationService,
  calculatePriceForTour,
  validateTourDate,
} = await import('../src/services/reservation.service.js');

describe('ReservationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function futureDate(days = 30) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function costaRicaDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  }

  it('requires an explicit date while returning the selected tour and valid next step', async () => {
    mockGetTourById.mockResolvedValue({
      id: 1,
      name: 'Monteverde Quetzal Tour',
      price: 120,
      availableSlots: 5,
      maxParticipants: 5,
      tourType: 'unscheduled',
      location: 'Monteverde',
      durationHours: 4,
      difficulty: 'moderate',
    });

    await expect(reservationService.checkTourAvailability({ tourId: 1 }, {
      userId: 7,
      conversationId: 'conversation-123',
      model: 'gpt-test',
      source: 'voice',
      agentPlan: {
        status: 'select_tour',
      },
      experimentAssignments: {
        tourRecommendation: {
          experiment: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v2',
        },
      },
    })).resolves.toMatchObject({
      success: true,
      tourId: 1,
      availableSlots: null,
      isAvailable: false,
      requiresDateSelection: true,
      code: 'TOUR_DATE_REQUIRED',
    });
    expect(mockGetTourById).toHaveBeenCalledWith(1);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: 7,
      anonymousId: 'conversation:conversation-123',
      event: 'tour_selected',
      idempotencyKey: 'conversation-123:1',
      properties: {
        conversationId: 'conversation-123',
        source: 'voice',
        tourId: 1,
        experiment: 'tour_recommendation_prompt',
        variant: 'recommendation_prompt_v2',
      },
    });
    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: 7,
      anonymousId: 'conversation:conversation-123',
      event: 'availability_checked',
      properties: {
        conversationId: 'conversation-123',
        source: 'voice',
        tourId: 1,
        participants: undefined,
        availabilityResult: false,
        availableSlots: null,
      },
    });
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
      date: '2026-06-02',
    }, {
      authUser: { plan: 'PRO' },
      model: 'gpt-test',
      ragTrace: { retrievedChunkCount: 2 },
      source: 'voice',
      aiTraceId: '11111111-1111-4111-8111-111111111111',
      experimentAssignments: {
        tourRecommendation: {
          experiment: 'tour_recommendation_prompt',
          variant: 'recommendation_prompt_v2',
        },
      },
    });

    expect(result).toMatchObject({
      success: true,
      id: 42,
      reservationId: 42,
      customerName: 'Ana Gomez',
      conversationId: 'conversation-123',
      tourId: 1,
      participants: 2,
      confirmationCode: 'BW-ABC123',
      createdAt,
      totalPrice: 240,
      tourTotalPrice: 240,
      remainingSlots: 3,
    });
    expect(result).not.toHaveProperty('customer_name');
    expect(result).not.toHaveProperty('tour_id');
    expect(result).not.toHaveProperty('confirmation_code');
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('total_price');
    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
      customerEmail: null,
      conversationId: 'conversation-123',
      discountRate: 0,
      confirmationCode: expect.stringMatching(/^BW-/),
    }));
    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: undefined,
      anonymousId: 'conversation:conversation-123',
      event: 'reservation_started',
      idempotencyKey: 'conversation-123:1:2',
      properties: {
        conversationId: 'conversation-123',
        participants: 2,
        plan: 'PRO',
        source: 'voice',
        tourId: 1,
        aiTraceId: '11111111-1111-4111-8111-111111111111',
        experiment: 'tour_recommendation_prompt',
        variant: 'recommendation_prompt_v2',
      },
    });
    expect(mockAnalyticsTrack).toHaveBeenCalledWith({
      userId: undefined,
      anonymousId: 'conversation:conversation-123',
      event: 'reservation_completed',
      idempotencyKey: 42,
      properties: {
        conversationId: 'conversation-123',
        plan: 'PRO',
        source: 'voice',
        tourId: 1,
        participants: 2,
        amount: 240,
        currency: 'USD',
        aiTraceId: '11111111-1111-4111-8111-111111111111',
        experiment: 'tour_recommendation_prompt',
        variant: 'recommendation_prompt_v2',
      },
    });
  });

  it('uses request context for itinerary dates without storing reservation metadata', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    const transfer = {
      transferOption: 'shared_shuttle',
      label: 'Shared shuttle',
      origin: 'San Jose',
      destination: 'Monteverde',
      pricePerPerson: 65,
      totalPrice: 130,
      currency: 'USD',
    };

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
        userId: 7,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
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
      customerEmail: 'ana@example.com',
      conversationId: 'conversation-123',
      date: '2026-06-02',
    }, {
      userId: 7,
      selectedTransfer: transfer,
      customerContext: {
        itineraryStartDate: '2026-06-01',
        itineraryEndDate: '2026-06-03',
      },
    });

    expect(mockCreateReservation).toHaveBeenCalledWith(expect.not.objectContaining({
      metadata: expect.anything(),
    }));
    expect(result).toMatchObject({
      itineraryStartDate: '2026-06-01',
      itineraryEndDate: '2026-06-03',
    });
    expect(result).not.toHaveProperty('transfer');
    expect(result).not.toHaveProperty('transferPrice');
    expect(result).not.toHaveProperty('grandTotalPrice');
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
      date: '2026-06-02',
    });

    expect(result).toMatchObject({
      success: true,
      tourId: 10,
      tourName: 'Cerro de la Muerte Timberline Tour',
      participants: 2,
      remainingSlots: 2,
    });
    expect(mockGetAvailableTours).toHaveBeenCalledWith({ minSlots: 2 });
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

  it('passes authenticated user ID into reservation persistence', async () => {
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
        id: 45,
        userId: 7,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
        conversationId: 'conversation-123',
        tourId: 1,
        participants: 2,
        confirmationCode: 'BW-USER',
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
      customerEmail: 'ana@example.com',
      conversationId: 'conversation-123',
      date: '2026-06-02',
    }, {
      userId: 7,
    });

    expect(result).toMatchObject({
      success: true,
      userId: 7,
      customerEmail: 'ana@example.com',
    });
    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
    }));
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
      date: '2026-06-02',
    }, {
      conversationId: 'conversation-456',
    });

    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-456',
    }));
  });

  it('loads latest reservation for a conversation without embedded transfer metadata', async () => {
    const createdAt = new Date('2026-05-09T10:00:00.000Z');
    mockGetLatestByConversationId.mockResolvedValue({
      reservation: {
        id: 42,
        userId: 7,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
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

    await expect(reservationService.getLatestReservationForConversation('conversation-123', {
      userId: '7',
    })).resolves.toMatchObject({
      reservationId: 42,
      conversationId: 'conversation-123',
    });
    expect(mockGetLatestByConversationId).toHaveBeenCalledWith('conversation-123', 7);
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

  it('keeps operational capacity rejection authoritative after structurally valid extraction', async () => {
    mockGetTourById.mockResolvedValue({
      id: 1,
      name: 'Monteverde Quetzal Tour',
      price: 120,
      availableSlots: 8,
      location: 'Monteverde',
      durationHours: 4,
      difficulty: 'moderate',
    });
    mockCreateReservation.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
      message: 'Only 8 seats are available.',
      availableSlots: 8,
    });

    await expect(reservationService.createReservation({
      tourId: 1,
      participants: 500,
      customerName: 'Ana Gomez',
      date: '2026-06-02',
      itineraryStartDate: '2026-06-01',
      itineraryEndDate: '2026-06-03',
    })).resolves.toMatchObject({
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
      availableSlots: 8,
    });
    expect(mockCreateReservation).toHaveBeenCalledWith(expect.objectContaining({
      tourId: 1,
      participants: 500,
    }));
  });

  it('limits scheduled dates to available occurrences inside the itinerary', () => {
    const tour = {
      tourType: 'scheduled',
      occurrenceDates: [
        { date: '2026-09-09', status: 'scheduled', remainingSpaces: 4 },
        { date: '2026-09-10', status: 'scheduled', remainingSpaces: 1 },
        { date: '2026-09-11', status: 'scheduled', remainingSpaces: 4 },
      ],
    };
    expect(validateTourDate(tour, {
      date: '2026-09-11', participants: 3, itineraryStartDate: '2026-09-10', itineraryEndDate: '2026-09-12',
    })).toMatchObject({ success: true, date: '2026-09-11' });
    expect(validateTourDate(tour, {
      date: '2026-09-10', participants: 3, itineraryStartDate: '2026-09-10', itineraryEndDate: '2026-09-12',
    })).toMatchObject({ success: false, code: 'TOUR_DATE_UNAVAILABLE' });
    expect(validateTourDate(tour, {
      date: '2026-09-09', participants: 1, itineraryStartDate: '2026-09-10', itineraryEndDate: '2026-09-12',
    })).toMatchObject({ success: false, code: 'DATE_OUTSIDE_ITINERARY' });
  });

  it('enforces unscheduled minimum pricing', () => {
    expect(calculatePriceForTour({ id: 2, name: 'Flexible', price: 80, minimumPrice: 100 }, 2)).toMatchObject({
      success: true,
      pricePerPerson: 100,
      subtotal: 200,
      totalPrice: 200,
    });
  });

  it('uses max participants only for flexible tours and occurrence slots only for scheduled tours', async () => {
    mockGetTourById
      .mockResolvedValueOnce({
        id: 1, name: 'Flexible', location: 'Forest', isActive: true,
        tourType: 'unscheduled', maxParticipants: 5, availableSlots: 1,
      })
      .mockResolvedValueOnce({
        id: 2, name: 'Scheduled', location: 'Wetland', isActive: true,
        tourType: 'scheduled', maxParticipants: 2, availableSlots: 5,
        startDate: futureDate(),
      });

    await expect(reservationService.resolveTour({ tourId: 1, participants: 4 }))
      .resolves.toMatchObject({ success: true, tour: { name: 'Flexible' } });
    await expect(reservationService.resolveTour({ tourId: 2, participants: 4 }))
      .resolves.toMatchObject({ success: true, tour: { name: 'Scheduled' } });
  });

  it('rejects flexible max-participant overflow and scheduled tours that have started', async () => {
    const today = costaRicaDate();
    mockGetTourById
      .mockResolvedValueOnce({
        id: 1, name: 'Flexible', isActive: true, tourType: 'unscheduled',
        maxParticipants: 3, availableSlots: 100,
      })
      .mockResolvedValueOnce({
        id: 2, name: 'Scheduled', isActive: true, tourType: 'scheduled',
        maxParticipants: 100, availableSlots: 10, startDate: today,
      });

    await expect(reservationService.resolveTour({ tourId: 1, participants: 4 }))
      .resolves.toMatchObject({ success: false, code: 'TOUR_UNAVAILABLE' });
    await expect(reservationService.resolveTour({ tourId: 2, participants: 2 }))
      .resolves.toMatchObject({ success: false, code: 'TOUR_UNAVAILABLE' });
  });
});
