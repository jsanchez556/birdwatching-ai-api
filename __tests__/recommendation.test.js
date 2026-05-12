import { jest } from '@jest/globals';
import request from 'supertest';

const mockCreateStructuredRecommendation = jest.fn().mockResolvedValue({
  location: 'Monteverde',
  budget: 'moderate',
  days: 3,
  recommendations: {
    birdSpecies: [
      {
        name: 'Resplendent Quetzal',
        scientificName: 'Pharomachrus mocinno',
        bestTimeToSee: 'Early morning',
        habitat: 'Cloud forest'
      }
    ],
    bestSpots: [
      {
        name: 'Monteverde Cloud Forest Reserve',
        region: 'Puntarenas',
        highlights: ['Quetzal watching', 'Trail walks'],
        bestSeason: 'December to April'
      }
    ],
    suggestedItinerary: [
      {
        day: 1,
        location: 'Monteverde',
        activities: ['Arrive and check in', 'Evening bird walk'],
        targetBirds: ['Toucan', 'Motmot']
      }
    ]
  }
});

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/openai.client.js', () => ({
  default: {
    createChatCompletion: jest.fn(),
    createStructuredRecommendation: mockCreateStructuredRecommendation,
  },
}));

const { default: app } = await import('../src/app.js');

describe('/recommend endpoint', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return recommendations for valid input', async () => {
    const mockRecommendations = {
      location: 'Monteverde',
      budget: 'moderate',
      days: 3,
      recommendations: {
        birdSpecies: [
          {
            name: 'Resplendent Quetzal',
            scientificName: 'Pharomachrus mocinno',
            bestTimeToSee: 'Early morning',
            habitat: 'Cloud forest'
          }
        ],
        bestSpots: [
          {
            name: 'Monteverde Cloud Forest Reserve',
            region: 'Puntarenas',
            highlights: ['Quetzal watching', 'Trail walks'],
            bestSeason: 'December to April'
          }
        ],
        suggestedItinerary: [
          {
            day: 1,
            location: 'Monteverde',
            activities: ['Arrive and check in', 'Evening bird walk'],
            targetBirds: ['Toucan', 'Motmot']
          }
        ]
      }
    };

    mockCreateStructuredRecommendation.mockResolvedValue(mockRecommendations);

    const response = await request(app)
      .post('/recommend')
      .send({
        location: 'Monteverde',
        budget: 'moderate',
        days: 3
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('recommendations');
    expect(response.body.data.recommendations.birdSpecies).toHaveLength(1);
    expect(response.body.data.recommendations.bestSpots).toHaveLength(1);
    expect(response.body.data.recommendations.suggestedItinerary).toHaveLength(1);
    expect(response.body.meta).toEqual({
      promptVersions: {
        recommendation: '1.0.0',
      },
    });
    expect(mockCreateStructuredRecommendation).toHaveBeenCalledWith('Monteverde', 'moderate', 3);
  });

  it('should return 400 for missing location', async () => {
    const response = await request(app)
      .post('/recommend')
      .send({
        budget: 'moderate',
        days: 3
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error.message).toBe('Invalid recommendation payload');
    expect(response.body.error.details.join(' ')).toContain('required');
  });

  it('should return 400 for missing budget', async () => {
    const response = await request(app)
      .post('/recommend')
      .send({
        location: 'Monteverde',
        days: 3
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error.message).toBe('Invalid recommendation payload');
    expect(response.body.error.details.join(' ')).toContain('required');
  });

  it('should return 400 for missing days', async () => {
    const response = await request(app)
      .post('/recommend')
      .send({
        location: 'Monteverde',
        budget: 'moderate'
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error.message).toBe('Invalid recommendation payload');
    expect(response.body.error.details.join(' ')).toContain('required');
  });

  it('should return 500 when OpenAI fails', async () => {
    mockCreateStructuredRecommendation.mockRejectedValueOnce(new Error('API Error'));

    const response = await request(app)
      .post('/recommend')
      .send({
        location: 'Monteverde',
        budget: 'moderate',
        days: 3
      })
      .expect(500);

    expect(response.body).toHaveProperty('error');
  });
});
