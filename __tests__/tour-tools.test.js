import { jest } from '@jest/globals';

const mockCheckTourAvailability = jest.fn();
const mockCalculateTourPrice = jest.fn();
const mockCreateReservation = jest.fn();
const mockGetAvailableTours = jest.fn();
const mockRecommendTours = jest.fn();
const mockSelectTour = jest.fn();

await jest.unstable_mockModule('../src/services/reservation.service.js', () => ({
  default: {
    checkTourAvailability: mockCheckTourAvailability,
    calculateTourPrice: mockCalculateTourPrice,
    createReservation: mockCreateReservation,
  },
}));

await jest.unstable_mockModule('../src/services/tour.service.js', () => ({
  default: {
    getAvailableTours: mockGetAvailableTours,
    recommendTours: mockRecommendTours,
    selectTour: mockSelectTour,
  },
}));

const {
  calculateTourPrice,
  checkTourAvailability,
  createReservation,
  getAvailableTours,
  recommendTours,
  selectTour,
  tourToolHandlers,
} = await import('../src/ai/tools/tour-tools.js');

describe('tour tool adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates availability checks to the reservation service', async () => {
    mockCheckTourAvailability.mockResolvedValue({
      success: true,
      tourId: 1,
      availableSlots: 5,
    });

    await expect(checkTourAvailability({ tourId: 1 })).resolves.toEqual({
      success: true,
      tourId: 1,
      availableSlots: 5,
    });
    expect(mockCheckTourAvailability).toHaveBeenCalledWith({ tourId: 1 });
  });

  it('delegates tour listing to the tour service', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [{ tourId: 1, name: 'Monteverde Quetzal Tour' }],
    });

    await expect(getAvailableTours({ location: 'Monteverde' })).resolves.toEqual({
      success: true,
      tours: [{ tourId: 1, name: 'Monteverde Quetzal Tour' }],
    });
    expect(mockGetAvailableTours).toHaveBeenCalledWith({ location: 'Monteverde' });
  });

  it('delegates tour recommendations to the tour service', async () => {
    mockRecommendTours.mockResolvedValue({
      success: true,
      tours: [{ tourId: 1, recommendationScore: 8 }],
    });

    await expect(recommendTours({ location: 'Monteverde' })).resolves.toEqual({
      success: true,
      tours: [{ tourId: 1, recommendationScore: 8 }],
    });
  });

  it('delegates tour selection to the tour service', async () => {
    mockSelectTour.mockResolvedValue({
      success: true,
      selectedTour: { tourId: 1 },
    });

    await expect(selectTour({ tourId: 1 })).resolves.toEqual({
      success: true,
      selectedTour: { tourId: 1 },
    });
  });

  it('delegates price calculations to the reservation service', async () => {
    mockCalculateTourPrice.mockResolvedValue({
      success: true,
      totalPrice: 240,
    });

    await expect(calculateTourPrice({ tourId: 1, participants: 2 })).resolves.toEqual({
      success: true,
      totalPrice: 240,
    });
  });

  it('delegates reservations to the reservation service', async () => {
    mockCreateReservation.mockResolvedValue({
      success: true,
      id: 10,
      confirmation_code: 'BW-ABC',
    });

    await expect(createReservation({
      tourId: 1,
      participants: 2,
      customerName: 'Ana Gomez',
    }, {
      conversationId: 'conversation-123',
    })).resolves.toEqual({
      success: true,
      id: 10,
      confirmation_code: 'BW-ABC',
    });
    expect(mockCreateReservation).toHaveBeenCalledWith(
      {
        tourId: 1,
        participants: 2,
        customerName: 'Ana Gomez',
      },
      {
        conversationId: 'conversation-123',
      }
    );
  });

  it('exports handlers keyed by schema function names', () => {
    expect(tourToolHandlers).toEqual({
      getAvailableTours,
      recommendTours,
      selectTour,
      checkTourAvailability,
      calculateTourPrice,
      createReservation,
    });
  });
});
