import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockIdentify = jest.fn();

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/services/birdIdentification.service.js', () => ({
  default: {
    identifyFromInput: mockIdentify,
  },
}));

const { default: app } = await import('../src/app.js');

function authHeader() {
  const token = jwt.sign(
    { email: 'ana@example.com' },
    'test-jwt-secret',
    { subject: '7', expiresIn: '1h' }
  );

  return 'Bearer ' + token;
}

describe('bird identification endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzes the image URL and returns top candidate birds', async () => {
    mockIdentify.mockResolvedValue({
      summary: 'The image evidence points most strongly to Resplendent Quetzal.',
      imageObservations: {
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
        confidence: 0.82,
      },
      candidates: [
        {
          species: 'Resplendent Quetzal',
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits a male quetzal.',
          visualEvidence: ['green plumage', 'red belly', 'long tail'],
          scientificName: 'Pharomachrus mocinno',
          location: 'Monteverde',
          similarityScore: 0.94,
        },
      ],
      promptVersions: {
        birdImageAnalysis: '1.3.0',
        birdIdentification: '1.3.0',
      },
      model: 'gpt-4o',
      providerRequestId: 'identify-1',
      ragTrace: {
        retrievedChunkCount: 1,
        sourceCount: 1,
        groundedMessageCount: 3,
      },
    });

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(200);
    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.test/bird.jpg',
      imageUpload: undefined,
      userId: '7',
      metadata: expect.objectContaining({}),
    }));
    expect(res.body).toEqual({
      success: true,
      data: {
        summary: 'The image evidence points most strongly to Resplendent Quetzal.',
        imageObservations: {
          colors: ['green', 'red'],
          beak: 'yellow',
          size: 'medium',
          tail: 'long',
          wingPattern: 'plain',
          headPattern: 'plain',
          bellyColor: 'red',
          habitatHint: 'forest',
          confidence: 0.82,
        },
        candidates: [
          {
            species: 'Resplendent Quetzal',
            commonName: 'Resplendent Quetzal',
            confidence: 0.91,
            reasoning: 'Green and red plumage fits a male quetzal.',
            visualEvidence: ['green plumage', 'red belly', 'long tail'],
            scientificName: 'Pharomachrus mocinno',
            location: 'Monteverde',
            similarityScore: 0.94,
          },
        ],
      },
      meta: {
        promptVersions: {
          birdImageAnalysis: '1.3.0',
          birdIdentification: '1.3.0',
        },
        model: 'gpt-4o',
        ragTrace: {
          retrievedChunkCount: 1,
          sourceCount: 1,
          groundedMessageCount: 3,
        },
      },
    });
  });

  it('passes authenticated user id to bird identification history orchestration', async () => {
    mockIdentify.mockResolvedValue({
      summary: 'The image evidence points most strongly to Resplendent Quetzal.',
      imageObservations: {
        colors: ['green'],
        confidence: 0.82,
      },
      candidates: [
        {
          species: 'Resplendent Quetzal',
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green plumage fits.',
          visualEvidence: ['green plumage'],
        },
      ],
      promptVersions: {
        birdImageAnalysis: '1.3.0',
        birdIdentification: '1.3.0',
      },
      model: 'gpt-4o',
      providerRequestId: 'identify-1',
      ragTrace: {
        retrievedChunkCount: 0,
        sourceCount: 0,
      },
    });

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(200);
    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.test/bird.jpg',
      imageUpload: undefined,
      userId: '7',
    }));
  });

  it('requires authentication before bird identification', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .send({ imageUrl: 'https://example.test/bird.jpg' });

    expect(res.statusCode).toBe(401);
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('accepts authenticated raw image uploads', async () => {
    mockIdentify.mockResolvedValue({
      summary: 'The image evidence is uncertain, but the best match is Great Kiskadee.',
      imageObservations: {
        colors: ['yellow', 'brown'],
        confidence: 0.72,
      },
      candidates: [
        {
          species: 'Great Kiskadee',
          commonName: 'Great Kiskadee',
          confidence: 0.8,
          reasoning: 'Yellow belly and bold head pattern fit.',
          visualEvidence: ['yellow belly'],
        },
      ],
      promptVersions: {
        birdImageAnalysis: '1.3.0',
        birdIdentification: '1.3.0',
      },
      model: 'gpt-4o',
      providerRequestId: 'identify-2',
      ragTrace: {
        retrievedChunkCount: 0,
        sourceCount: 0,
      },
    });

    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .set('Content-Type', 'image/jpeg')
      .set('X-Filename', 'bird.jpg')
      .send(Buffer.from([0xff, 0xd8, 0xff]));

    expect(res.statusCode).toBe(200);
    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: undefined,
      userId: '7',
      imageUpload: expect.objectContaining({
        buffer: expect.any(Buffer),
        mimeType: 'image/jpeg',
        filename: 'bird.jpg',
      }),
    }));
    expect(res.body.data.candidates[0].commonName).toBe('Great Kiskadee');
  });

  it('rejects unsupported authenticated image uploads', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .set('Content-Type', 'text/plain')
      .send('not an image');

    expect(res.statusCode).toBe(422);
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('rejects invalid image URLs before service execution', async () => {
    const res = await request(app)
      .post('/birds/identify')
      .set('Authorization', authHeader())
      .send({ imageUrl: 'file:///tmp/bird.jpg', extra: true });

    expect(res.statusCode).toBe(422);
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'validation_error',
      },
    });
  });
});
