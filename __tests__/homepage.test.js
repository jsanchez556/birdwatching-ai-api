import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetFeaturedTours = jest.fn();
const mockGetBirdHighlights = jest.fn();
const mockGetTransportationAddOns = jest.fn();
const mockGetHeroContent = jest.fn();

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
    getTransportationAddOns: mockGetTransportationAddOns,
  },
}));

const { default: app } = await import('../src/app.js');

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
    mockGetBirdHighlights.mockReturnValue([
      {
        name: 'Resplendent Quetzal',
        description: 'Cloud forest icon.',
        region: 'Cloud forest',
        imageUrl: 'https://example.test/bird.jpg',
      },
    ]);

    const res = await request(app).get('/birds/highlights');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.birds[0]).toMatchObject({
      name: 'Resplendent Quetzal',
      region: 'Cloud forest',
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
