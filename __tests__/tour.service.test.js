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
        imagePath: 'tours/11111111-1111-4111-8111-111111111111.png',
        imageVersion: '1788477600000',
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
          availableSlots: null,
          durationValue: 4,
          durationUnit: 'hours',
          durationHours: 4,
          duration: '4 hours',
          difficulty: 'moderate',
          type: 'Birdwatching',
          imagePath: 'tours/11111111-1111-4111-8111-111111111111.png',
          imageVersion: '1788477600000',
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

  it('scores location matches without requiring accent marks', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Tapir Valley Birding Tour',
        price: 200,
        availableSlots: 8,
        location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
        durationHours: 4,
        difficulty: 'Easy',
      },
    ]);

    const result = await tourService.recommendTours({
      location: 'Tenorio-Bijagua and Rio Celeste',
      participants: 2,
    });

    expect(result.success).toBe(true);
    expect(result.tours[0]).toMatchObject({
      tourId: 1,
      name: 'Tapir Valley Birding Tour',
    });
    expect(result.tours[0].reasons).toContain('Matches Tenorio-Bijagua and Rio Celeste');
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

  it('does not treat San Jose pickup wording as a tour recommendation match', async () => {
    mockGetAvailableTours.mockResolvedValue([
      {
        id: 1,
        name: 'Tapir Valley Birding Tour',
        price: 200,
        availableSlots: 8,
        location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
        durationHours: 4,
        difficulty: 'Easy',
      },
      {
        id: 9,
        name: 'Santa Rosa Dry Forest Birding Tour',
        price: 60,
        availableSlots: 10,
        location: 'Santa Rosa and Santa Elena Peninsula / Santa Rosa National Park',
        durationHours: 4,
        difficulty: 'Easy',
      },
    ]);

    const result = await tourService.recommendTours({
      location: 'Tenorio-Bijagua and Rio Celeste',
      query: 'I want a birdwatching tour in bijagua of upala for 3 people with transfer from San Jose.',
      participants: 3,
      limit: 3,
    });

    expect(mockGetAvailableTours).toHaveBeenCalledWith(expect.objectContaining({
      location: 'Tenorio-Bijagua and Rio Celeste',
      minSlots: 3,
    }));
    expect(result.success).toBe(true);
    expect(result.tours[0]).toMatchObject({
      tourId: 1,
      name: 'Tapir Valley Birding Tour',
    });
    expect(result.tours.find((tour) => tour.tourId === 9)?.reasons || []).not.toContain('Matches san');
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

  it('does not guess an explicit tour selection from a partial tour name', async () => {
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
      success: false,
      code: 'TOUR_NOT_FOUND',
    });
    expect(mockSelectTour).not.toHaveBeenCalled();
  });

  it('requires a tour ID or name for selection', async () => {
    await expect(tourService.selectTour({ participants: 2 })).resolves.toEqual({
      success: false,
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'tourId or tourName is required',
    });
  });

  it('returns three deterministic recommendations and labels weaker eligible fillers', async () => {
    const exactMatch = { id: 1, name: 'Guanacaste Dry Forest', price: 100, availableSlots: 5, maxParticipants: 5, isActive: true, tourType: 'unscheduled', location: 'Guanacaste', durationHours: 4, difficulty: 'easy' };
    mockGetAvailableTours
      .mockResolvedValueOnce([exactMatch])
      .mockResolvedValueOnce([
        exactMatch,
        { id: 2, name: 'Carara Macaws', price: 90, availableSlots: 6, maxParticipants: 6, isActive: true, tourType: 'unscheduled', location: 'Central Pacific', durationHours: 5, difficulty: 'easy' },
        { id: 3, name: 'Savegre Quetzals', price: 120, availableSlots: 4, maxParticipants: 4, isActive: true, tourType: 'unscheduled', location: 'Savegre', durationHours: 5, difficulty: 'moderate' },
      ]);

    const result = await tourService.recommendTours({ location: 'Guanacaste', participants: 3 });

    expect(result.tours).toHaveLength(3);
    expect(result.tours[0]).toMatchObject({ tourId: 1, matchStrength: 'strong' });
    expect(result.tours.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchStrength: 'alternative', reasons: expect.arrayContaining(['Alternative eligible option']) }),
    ]));
  });

  it('excludes inactive, full, completed, and party-size-incompatible tours', async () => {
    mockGetAvailableTours.mockResolvedValue([
      { id: 1, name: 'Eligible', price: 100, availableSlots: 4, maxParticipants: 4, isActive: true, tourType: 'unscheduled', location: 'North', durationHours: 4, difficulty: 'easy' },
      { id: 2, name: 'Inactive', price: 90, availableSlots: 4, maxParticipants: 4, isActive: false, tourType: 'unscheduled', location: 'North', durationHours: 4, difficulty: 'easy' },
      { id: 3, name: 'Full', price: 80, availableSlots: 0, maxParticipants: 0, isActive: true, tourType: 'unscheduled', location: 'North', durationHours: 4, difficulty: 'easy' },
      { id: 4, name: 'Completed', price: 70, availableSlots: 4, maxParticipants: 4, isActive: true, tourType: 'scheduled', occurrenceDates: [{ date: '2026-01-01', status: 'completed', remainingSpaces: 4 }], location: 'North', durationHours: 4, difficulty: 'easy' },
      { id: 5, name: 'Too small', price: 60, availableSlots: 2, maxParticipants: 2, isActive: true, tourType: 'unscheduled', location: 'North', durationHours: 4, difficulty: 'easy' },
    ]);

    await expect(tourService.recommendTours({ participants: 3 })).resolves.toMatchObject({
      tours: [expect.objectContaining({ tourId: 1 })],
      fewerThanRequestedReason: 'Only 1 eligible tour can accommodate the request.',
    });
  });
});
