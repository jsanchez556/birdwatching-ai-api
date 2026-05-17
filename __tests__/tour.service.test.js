import { jest } from '@jest/globals';

const mockGetAvailableTours = jest.fn();
const mockSelectTour = jest.fn();

await jest.unstable_mockModule('../src/db/queries/tour.queries.js', () => ({
  default: {
    getAvailableTours: mockGetAvailableTours,
    selectTour: mockSelectTour,
  },
}));

const { default: tourService } = await import('../src/services/tour.service.js');

describe('TourService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists available tours with normalized fields', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    ]);

    await expect(tourService.getAvailableTours({ location: 'Monteverde' })).resolves.toEqual({
      success: true,
      tours: [
        {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          location: 'Monteverde',
          pricePerPerson: 120,
          availableSlots: 5,
          durationHours: 4,
          difficulty: 'moderate',
        },
      ],
    });
  });

  it('recommends ranked matching tours', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
      {
        id: 4,
        name: 'Savegre Highland Birding Tour',
        price: 145,
        availableSlots: 4,
        location: 'San Gerardo de Dota',
        durationHours: 6,
        difficulty: 'moderate',
      },
    ]);

    const result = await tourService.recommendTours({
      location: 'Monteverde',
      budget: 'moderate',
      difficulty: 'moderate',
      participants: 2,
    });

    expect(result.success).toBe(true);
    expect(result.tours[0]).toMatchObject({
      tourId: 1,
      recommendationScore: expect.any(Number),
    });
  });

  it('prioritizes direct query matches such as quetzal tour names', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 2,
        name: 'Sarapiqui Rainforest Tour',
        price: 95,
        availableSlots: 3,
        location: 'Sarapiqui',
        durationHours: 5,
        difficulty: 'easy',
      },
      {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
      {
        id: 9,
        name: 'Palo Verde Wetlands Birding',
        price: 105,
        availableSlots: 9,
        location: 'Palo Verde National Park',
        durationHours: 4,
        difficulty: 'easy',
      },
    ]);

    const result = await tourService.recommendTours({
      query: 'where can i see quetzals?',
      participants: 1,
    });

    expect(result.success).toBe(true);
    expect(result.tours[0]).toMatchObject({
      tourId: 1,
      name: 'Monteverde Quetzal Tour',
    });
    expect(result.tours[0].reasons).toContain('Matches quetzal');
  });

  it('validates explicit tour selection', async () => {
    mockSelectTour.mockResolvedValue({
      success: true,
      message: 'Selected',
      tour: {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    });

    await expect(tourService.selectTour({ tourId: 1, participants: 2 })).resolves.toMatchObject({
      success: true,
      selectedTour: {
        tourId: 1,
      },
      nextStep: expect.stringContaining('participant count'),
    });
  });

  it('validates explicit tour selection by clear tour name', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    ]);
    mockSelectTour.mockResolvedValue({
      success: true,
      message: 'Selected',
      tour: {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    });

    await expect(tourService.selectTour({
      tourName: 'Monteverde Quetzal Tour',
      participants: 2,
    })).resolves.toMatchObject({
      success: true,
      selectedTour: {
        tourId: 1,
        name: 'Monteverde Quetzal Tour',
      },
    });
    expect(mockGetAvailableTours).toHaveBeenCalledWith({ minSlots: 2 });
    expect(mockSelectTour).toHaveBeenCalledWith({ tourId: 1, participants: 2 });
  });

  it('validates explicit tour selection by partial tour name', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    ]);
    mockSelectTour.mockResolvedValue({
      success: true,
      message: 'Selected',
      tour: {
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: 120,
        availableSlots: 5,
        location: 'Monteverde',
        durationHours: 4,
        difficulty: 'moderate',
      },
    });

    await expect(tourService.selectTour({
      tourName: 'Monteverde tour',
      participants: 2,
    })).resolves.toMatchObject({
      success: true,
      selectedTour: {
        tourId: 1,
        name: 'Monteverde Quetzal Tour',
      },
    });
    expect(mockSelectTour).toHaveBeenCalledWith({ tourId: 1, participants: 2 });
  });

  it('requires a tour ID or name for selection', async () => {
    await expect(tourService.selectTour({ participants: 2 })).resolves.toEqual({
      success: false,
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'tourId or tourName is required',
    });
  });
});
