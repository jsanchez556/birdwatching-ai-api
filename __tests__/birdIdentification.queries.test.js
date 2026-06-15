import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: birdIdentificationQueries } = await import('../src/db/queries/birdIdentification.queries.js');

describe('BirdIdentificationQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a bird identification history row', async () => {
    const historyRow = {
      id: 12,
      user_id: 7,
      image_url: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: '0.9100',
      created_at: new Date(),
    };
    mockQuery.mockResolvedValue({ rows: [historyRow] });

    await expect(birdIdentificationQueries.createHistory({
      userId: 7,
      imageUrl: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91,
    })).resolves.toBe(historyRow);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM save_bird_identification($1, $2, $3, $4, $5::jsonb, $6::jsonb)',
      [7, 'https://example.test/bird.jpg', 'Resplendent Quetzal', 0.91, 'null', '{}']
    );
  });

  it('throws when the database insert fails', async () => {
    mockQuery.mockRejectedValue(new Error('Database error'));

    await expect(birdIdentificationQueries.createHistory({
      userId: 7,
      imageUrl: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91,
    })).rejects.toThrow('Database error');
  });

  it('stores result payloads with bird identification history rows', async () => {
    const historyRow = {
      id: 12,
    };
    const result = {
      status: 'identified',
    };
    const meta = {
      model: 'gpt-4o',
    };
    mockQuery.mockResolvedValue({ rows: [historyRow] });

    await expect(birdIdentificationQueries.createHistory({
      userId: 7,
      imageUrl: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91,
      result,
      meta,
    })).resolves.toBe(historyRow);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM save_bird_identification($1, $2, $3, $4, $5::jsonb, $6::jsonb)',
      [
        7,
        'https://example.test/bird.jpg',
        'Resplendent Quetzal',
        0.91,
        JSON.stringify(result),
        JSON.stringify(meta),
      ]
    );
  });
});
