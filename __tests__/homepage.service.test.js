import { jest } from '@jest/globals';

const mockGetAvailableTours = jest.fn();
const mockGetBirdProfile = jest.fn();
const TOUR_IMAGE_PATH = 'tours/550e8400-e29b-41d4-a716-446655440000.png';

await jest.unstable_mockModule('../src/services/tour.service.js', () => ({
  default: {
    getAvailableTours: mockGetAvailableTours,
  },
}));

await jest.unstable_mockModule('../src/services/rag.service.js', () => ({
  default: {
    getBirdProfile: mockGetBirdProfile,
  },
}));

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    headLineBirds: [
      'quetz1',
      'Keel-billed Toucan',
      'Scarlet Macaw',
      'Snowcap',
      'Sunbittern',
      'Three-wattled Bellbird',
    ],
    homepageBirdHighlights: [],
  },
}));

const { default: homepageService } = await import('../src/services/homepage.service.js');

describe('HomepageService media enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the persisted UUID tour image as a media route path', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [
        {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          description: 'Cloud forest birding.',
          location: 'Monteverde',
          node: 'Miravalles',
          subnode: 'Bijagua',
          pricePerPerson: 120,
          durationHours: 4,
          difficulty: 'moderate',
          imagePath: TOUR_IMAGE_PATH,
          imageVersion: '1788477600000',
        },
      ],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        title: 'Monteverde Quetzal Tour',
        node: 'Miravalles',
        subnode: 'Bijagua',
        imagePath: TOUR_IMAGE_PATH,
        portraitUrl: `/files/${TOUR_IMAGE_PATH}?v=1788477600000`,
      }),
    ]);

    expect(await homepageService.getFeaturedTours()).toEqual([
      expect.not.objectContaining({
        images: expect.anything(),
        imageUrl: expect.anything(),
      }),
    ]);
  });

  it('derives a read-only deterministic portrait path when no image is persisted', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [
        {
          tourId: 999,
          name: 'Unmapped Birding Tour',
          location: 'Osa',
          pricePerPerson: 180,
          durationHours: 6,
        },
      ],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        id: 999,
        imagePath: null,
        portraitUrl: '/files/tours/999.png',
      }),
    ]);
  });

  it('accepts a persisted deterministic image path', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [{
        tourId: 1,
        name: 'Stored portrait tour',
        location: 'Osa',
        pricePerPerson: 180,
        durationHours: 6,
        imagePath: 'tours/1.png',
      }],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        imagePath: 'tours/1.png',
        portraitUrl: '/files/tours/1.png',
      }),
    ]);
  });

  it('accepts a legacy extensionless numeric image path', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [{
        tourId: 11,
        name: 'Legacy portrait tour',
        location: 'Bijagua',
        pricePerPerson: 150,
        durationHours: 3,
        imagePath: 'tours/11',
        imageVersion: '1788480238110',
      }],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        imagePath: 'tours/11',
        portraitUrl: '/files/tours/11.png?v=1788480238110',
      }),
    ]);
  });

  it('does not derive a fallback for an invalid persisted image path', async () => {
    mockGetAvailableTours.mockResolvedValue({
      success: true,
      tours: [{
        tourId: 1,
        name: 'Invalid portrait tour',
        location: 'Osa',
        pricePerPerson: 180,
        durationHours: 6,
        imagePath: 'tours/not-this-tour.jpg',
        imageVersion: '1788477600000',
      }],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        imagePath: 'tours/not-this-tour.jpg',
        portraitUrl: null,
      }),
    ]);
  });

  it('returns up to five configured headline bird profiles from RAG', async () => {
    mockGetBirdProfile.mockImplementation(async ({ speciesCode, name }) => ({
      speciesCode: speciesCode || `${name.toLowerCase().replace(/\W+/g, '').slice(0, 6)}1`,
      commonName: name || 'Resplendent Quetzal',
      scientificName: 'Example scientific name',
      family: 'Example family',
      description: 'Profile description.',
      locations: 'Costa Rica',
      media: {
        photoUrl: '/photos/example.jpg',
      },
    }));

    const birds = await homepageService.getBirdHighlights();

    expect(birds).toHaveLength(5);
    expect(birds[0]).toEqual(expect.objectContaining({
      commonName: expect.any(String),
      description: 'Profile description.',
      media: {
        photoUrl: '/photos/example.jpg',
      },
    }));
    expect(mockGetBirdProfile).toHaveBeenCalledTimes(5);
  });

  it('returns no headline birds when none are configured', async () => {
    const env = (await import('../src/config/env.js')).default;
    const originalHeadLineBirds = env.headLineBirds;
    env.headLineBirds = [];

    try {
      await expect(homepageService.getBirdHighlights()).resolves.toEqual([]);
      expect(mockGetBirdProfile).not.toHaveBeenCalled();
    } finally {
      env.headLineBirds = originalHeadLineBirds;
    }
  });

  it('returns a single bird profile through the homepage service', async () => {
    mockGetBirdProfile.mockResolvedValue({
      speciesCode: 'quetz1',
      commonName: 'Resplendent Quetzal',
    });

    await expect(homepageService.getBirdProfile({
      speciesCode: 'quetz1',
      name: 'Resplendent Quetzal',
    })).resolves.toEqual({
      speciesCode: 'quetz1',
      commonName: 'Resplendent Quetzal',
    });
    expect(mockGetBirdProfile).toHaveBeenCalledWith({
      speciesCode: 'quetz1',
      name: 'Resplendent Quetzal',
    });
  });
});
