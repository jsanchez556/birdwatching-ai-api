import { jest } from '@jest/globals';

const mockGetAvailableTours = jest.fn();
const mockGetBirdProfile = jest.fn();

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

  it('uses configured tour portrait assets as media route paths', async () => {
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
        },
      ],
    });

    await expect(homepageService.getFeaturedTours()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        title: 'Monteverde Quetzal Tour',
        node: 'Miravalles',
        subnode: 'Bijagua',
        portraitUrl: '/files/tours/1.png',
      }),
    ]);

    expect(await homepageService.getFeaturedTours()).toEqual([
      expect.not.objectContaining({
        images: expect.anything(),
        imageUrl: expect.anything(),
      }),
    ]);
  });

  it('returns empty media fallbacks when a tour has no configured portrait', async () => {
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
