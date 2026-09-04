import { jest } from '@jest/globals';

const mockGetState = jest.fn();
const mockBook = jest.fn();
const mockAnalyticsTrack = jest.fn();
const mockGetTourById = jest.fn();

await jest.unstable_mockModule('../src/db/queries/reservationState.queries.js', () => ({
  default: {
    get: mockGetState,
    book: mockBook,
  },
}));

await jest.unstable_mockModule('../src/db/queries/reservation.queries.js', () => ({
  default: {
    createReservation: jest.fn(),
    getLatestByConversationId: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/db/queries/tour.queries.js', () => ({
  default: {
    getAvailableTours: jest.fn(),
    getTourById: mockGetTourById,
  },
}));

await jest.unstable_mockModule('../src/analytics/analytics.service.js', () => ({
  default: { track: mockAnalyticsTrack },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: reservationService } = await import('../src/services/reservation.service.js');

const confirmed = {
  tourId: 9,
  date: '2026-08-12',
  participants: 4,
  transferRequired: false,
  customerName: 'Ana Gomez',
  customerEmail: 'ana@example.com',
  itineraryStartDate: '2026-08-12',
  itineraryEndDate: '2026-08-14',
};

function readyState(overrides = {}) {
  return {
    version: 7,
    status: 'ready_for_confirmation',
    proposed: {},
    confirmed,
    ...overrides,
  };
}

function bookedResult(overrides = {}) {
  return {
    success: true,
    id: 42,
    user_id: 7,
    customer_name: 'Ana Gomez',
    customer_email: 'ana@example.com',
    conversation_id: 'conversation-1',
    tour_id: 9,
    participants: 4,
    confirmation_code: 'BW-STATE',
    created_at: '2026-08-01T12:00:00.000Z',
    total_price: 432,
    tour_name: 'Structured State Tour',
    tour_available_slots: 6,
    state_version: 8,
    idempotent: false,
    ...overrides,
  };
}

describe('ReservationService structured-state booking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTourById.mockResolvedValue({ id: 9, isActive: true });
  });

  it('books using the latest confirmed state and expected version only', async () => {
    mockGetState.mockResolvedValue(readyState());
    mockBook.mockResolvedValue(bookedResult());

    const result = await reservationService.createReservationFromState({
      expectedStateVersion: 7,
      participants: 999,
      tourId: 999,
    }, {
      conversationId: 'conversation-1',
      userId: 7,
      source: 'chat',
    });

    expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      userId: 7,
      expectedVersion: 7,
      idempotencyKey: 'conversation-1:7',
    }));
    expect(mockBook.mock.calls[0][0]).not.toHaveProperty('participants');
    expect(mockBook.mock.calls[0][0]).not.toHaveProperty('tourId');
    expect(result).toMatchObject({
      success: true,
      tourId: 9,
      participants: 4,
      stateVersion: 8,
      idempotent: false,
    });
  });

  it.each([
    ['proposed values', readyState({ proposed: { participants: 5 }, status: 'collecting_information' })],
    ['missing confirmed values', readyState({ confirmed: { participants: 4 }, status: 'collecting_information' })],
  ])('rejects booking with %s before reaching the booking function', async (_label, state) => {
    mockGetState.mockResolvedValue(state);

    await expect(reservationService.createReservationFromState({
      expectedStateVersion: state.version,
    }, {
      conversationId: 'conversation-1',
      userId: 7,
    })).resolves.toMatchObject({
      success: false,
      code: 'RESERVATION_STATE_NOT_READY',
    });
    expect(mockBook).not.toHaveBeenCalled();
  });

  it('returns a retryable conflict for a stale booking version', async () => {
    mockGetState.mockResolvedValue(readyState());
    mockBook.mockRejectedValue(Object.assign(new Error('stale'), { code: '40001' }));

    await expect(reservationService.createReservationFromState({
      expectedStateVersion: 6,
    }, {
      conversationId: 'conversation-1',
      userId: 7,
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      code: 'RESERVATION_STATE_CONFLICT',
      retryable: true,
    }));
  });

  it('does not report confirmation or emit completion analytics when booking fails', async () => {
    mockGetState.mockResolvedValue(readyState());
    mockBook.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
      message: 'Not enough availability.',
      state_version: 7,
    });

    const result = await reservationService.createReservationFromState({
      expectedStateVersion: 7,
    }, {
      conversationId: 'conversation-1',
      userId: 7,
    });

    expect(result).toMatchObject({
      success: false,
      code: 'INSUFFICIENT_AVAILABILITY',
    });
    expect(result).not.toHaveProperty('confirmationCode');
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('returns an existing reservation idempotently for a repeated booking request', async () => {
    mockGetState.mockResolvedValue(readyState({ status: 'confirmed', version: 8 }));
    mockBook.mockResolvedValue(bookedResult({ state_version: 8, idempotent: true }));

    const result = await reservationService.createReservationFromState({
      expectedStateVersion: 7,
    }, {
      conversationId: 'conversation-1',
      userId: 7,
    });

    expect(result).toMatchObject({ reservationId: 42, idempotent: true, stateVersion: 8 });
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });
});
