import { jest } from '@jest/globals';

const mockCreateReservation = jest.fn();

await jest.unstable_mockModule('../src/services/reservation.service.js', () => ({
  default: {
    createReservation: mockCreateReservation,
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
    });

    await expect(createReservation({
      tourId: 1,
      participants: 3,
      customerName: 'Jose Sanchez',
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
      tourId: 1,
      participants: 3,
      customerName: 'Jose Sanchez',
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
      tourId: 1,
      participants: 3,
      customerName: 'Jose Sanchez',
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
});
