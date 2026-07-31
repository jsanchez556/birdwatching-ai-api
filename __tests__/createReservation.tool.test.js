import { jest } from '@jest/globals';

const mockCreateReservation = jest.fn();

await jest.unstable_mockModule('../src/services/reservation.service.js', () => ({
  default: {
    createReservationFromState: mockCreateReservation,
  },
}));

const { createReservation } = await import('../src/ai/tools/createReservation.tool.js');

describe('createReservation tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds selected transportation totals without duplicating transportation details', async () => {
    mockCreateReservation.mockResolvedValue({
      success: true,
      reservationId: 42,
      confirmationCode: 'BW-ABC123',
      customerName: 'Jose Sanchez',
      tourName: 'Monteverde Quetzal Tour',
      participants: 3,
      totalPrice: 360,
      currency: 'USD',
      transportationRequired: true,
      itineraryStartDate: '2026-05-17',
      itineraryEndDate: '2026-05-17',
    });

    await expect(createReservation({
      expectedStateVersion: 4,
    }, {
      customerContext: {
        itineraryStartDate: '2026-05-17',
        itineraryEndDate: '2026-05-17',
      },
      selectedTransportation: {
        transportationOption: 'shared_shuttle',
        label: 'Shared shuttle',
        origin: 'San Jose',
        destination: 'Monteverde',
        pricePerPerson: 65,
        totalPrice: 195,
        currency: 'USD',
        estimatedTravelTime: '3.5-4.5 hours from San Jose',
      },
    })).resolves.toMatchObject({
      success: true,
      tourTotalPrice: 360,
      transportationPrice: 195,
      grandTotalPrice: 555,
      itineraryStartDate: '2026-05-17',
      itineraryEndDate: '2026-05-17',
    });
    await expect(createReservation({
      expectedStateVersion: 4,
    }, {
      selectedTransportation: {
        transportationOption: 'shared_shuttle',
        totalPrice: 195,
      },
    })).resolves.not.toHaveProperty('transportation');
  });

  it('does not add transportation totals when selected transportation is absent', async () => {
    mockCreateReservation.mockResolvedValue({
      success: true,
      reservationId: 43,
      confirmationCode: 'BW-NOTRANSPORT',
      customerName: 'Jose Sanchez',
      tourName: 'Monteverde Quetzal Tour',
      participants: 3,
      totalPrice: 360,
      currency: 'USD',
    });

    await expect(createReservation({
      expectedStateVersion: 4,
    })).resolves.toEqual({
      success: true,
      reservationId: 43,
      confirmationCode: 'BW-NOTRANSPORT',
      customerName: 'Jose Sanchez',
      tourName: 'Monteverde Quetzal Tour',
      participants: 3,
      totalPrice: 360,
      currency: 'USD',
      itineraryStartDate: undefined,
      itineraryEndDate: undefined,
    });
  });

  it('passes only the expected state version to the reservation service', async () => {
    mockCreateReservation.mockResolvedValue({
      success: false,
      code: 'RESERVATION_STATE_CONFLICT',
      retryable: true,
    });

    await createReservation({
      expectedStateVersion: 11,
      participants: 999,
      tourId: 999,
    }, { conversationId: 'conversation-1' });

    expect(mockCreateReservation).toHaveBeenCalledWith(
      { expectedStateVersion: 11 },
      { conversationId: 'conversation-1' }
    );
  });
});
