import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetFeaturedTours = jest.fn();
const mockGetBirdHighlights = jest.fn();
const mockGetTransportationAddOns = jest.fn();
const mockGetHeroContent = jest.fn();
const mockGetBirdProfile = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/homepage.service.js', () => ({
  default: {
    getHeroContent: mockGetHeroContent,
    getFeaturedTours: mockGetFeaturedTours,
    getBirdHighlights: mockGetBirdHighlights,
    getBirdProfile: mockGetBirdProfile,
    getTransportationAddOns: mockGetTransportationAddOns,
  },
}));

const { default: app } = await import('../src/api/app.js');

describe('homepage endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns homepage hero content', async () => {
    mockGetHeroContent.mockReturnValue({
      heroVideo: 'https://www.youtube-nocookie.com/embed/example',
    });

    const res = await request(app).get('/homepage/hero');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        hero: {
          heroVideo: 'https://www.youtube-nocookie.com/embed/example',
        },
      },
      meta: {},
    });
  });

  it('returns featured tours', async () => {
    mockGetFeaturedTours.mockResolvedValue([
      {
        id: 1,
        title: 'Monteverde Quetzal Tour',
        description: 'Cloud forest birding.',
        location: 'Monteverde',
        duration: '4 hours',
        pricePerPerson: 120,
        imageUrl: 'https://example.test/tour.jpg',
      },
    ]);

    const res = await request(app).get('/tours');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        tourTypes: ['Birdwatching', 'Day walk', 'Night walk', 'Parks', 'Other'],
        tours: [
          {
            id: 1,
            title: 'Monteverde Quetzal Tour',
            description: 'Cloud forest birding.',
            location: 'Monteverde',
            duration: '4 hours',
            pricePerPerson: 120,
            imageUrl: 'https://example.test/tour.jpg',
          },
        ],
      },
      meta: {},
    });
  });

  it('returns bird species highlights', async () => {
    mockGetBirdHighlights.mockResolvedValue([
      {
        commonName: 'Resplendent Quetzal',
        description: 'Cloud forest icon.',
        locations: 'Cloud forest',
        media: {
          photoUrl: 'https://example.test/bird.jpg',
        },
      },
    ]);

    const res = await request(app).get('/birds/highlights');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.birds[0]).toMatchObject({
      commonName: 'Resplendent Quetzal',
      locations: 'Cloud forest',
    });
  });

  it('returns a bird profile by species code', async () => {
    mockGetBirdProfile.mockResolvedValue({
      speciesCode: 'quetz1',
      commonName: 'Resplendent Quetzal',
      scientificName: 'Pharomachrus mocinno',
      description: 'Cloud forest bird.',
      media: {
        photoUrl: '/photos/quetzal.jpg',
      },
    });

    const res = await request(app).get('/birds/profile?speciesCode=quetz1&name=Resplendent%20Quetzal');

    expect(res.statusCode).toBe(200);
    expect(mockGetBirdProfile).toHaveBeenCalledWith({
      speciesCode: 'quetz1',
      name: 'Resplendent Quetzal',
    });
    expect(res.body).toEqual({
      success: true,
      data: {
        bird: {
          speciesCode: 'quetz1',
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          description: 'Cloud forest bird.',
          media: {
            photoUrl: '/photos/quetzal.jpg',
          },
        },
      },
      meta: {},
    });
  });

  it('rejects bird profile requests without an identifier', async () => {
    const res = await request(app).get('/birds/profile');

    expect(res.statusCode).toBe(422);
    expect(mockGetBirdProfile).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'validation_error',
      },
    });
  });

  it('returns not found when a bird profile is unavailable', async () => {
    mockGetBirdProfile.mockResolvedValue(null);

    const res = await request(app).get('/birds/profile?name=Unknown%20Bird');

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'bird_not_found',
      },
    });
  });

  it('returns transportation add-ons', async () => {
    mockGetTransportationAddOns.mockReturnValue([
      {
        id: 'shared-shuttle',
        title: 'Shared birding shuttle',
        description: 'Scheduled transfers.',
        coverage: 'San Jose, Monteverde',
        startingPrice: 'From $55 per person',
      },
    ]);

    const res = await request(app).get('/addons/transportation');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.transportation[0]).toMatchObject({
      id: 'shared-shuttle',
      startingPrice: 'From $55 per person',
    });
  });
});
