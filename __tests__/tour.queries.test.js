import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const mockQuery = jest.fn();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const { default: tourQueries } = await import('../src/db/queries/tour.queries.js');

describe('TourQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads a tour by ID through a PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: '120.00',
        available_slots: 5,
        location: 'Monteverde',
        duration_hours: 4,
        difficulty: 'moderate',
      }],
    });

    await expect(tourQueries.getTourById(1)).resolves.toMatchObject({
      id: 1,
      price: 120,
      availableSlots: 5,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('get_tour_by_id'),
      [1]
    );
  });

  it('lists available tours through a PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: '120.00',
        available_slots: 5,
        location: 'Monteverde',
        duration_hours: 4,
        difficulty: 'moderate',
      }],
    });

    await expect(tourQueries.getAvailableTours({
      location: 'Monteverde',
      minSlots: 2,
    })).resolves.toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('get_available_tours'),
      ['Monteverde', null, null, 2]
    );
  });

  it('keeps available tour location matching accent-insensitive in SQL', () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../src/db/migrations/012_accent_insensitive_tour_search.sql'),
      'utf8'
    );

    expect(migration).toContain('normalize_search_text');
    expect(migration).toContain('translate(');
    expect(migration).toContain('ÍÌÎÏíìîï');
    expect(migration).toContain('IIIIiiii');
    expect(migration).toContain('normalized_location TEXT := normalize_search_text(p_location)');
    expect(migration).toContain('normalize_search_text(tour_node.name)');
    expect(migration).toContain('normalize_search_text(parent_node.name)');
    expect(migration).toContain('normalize_search_text(z.name)');
    expect(migration).toContain('normalize_search_text(t.name)');
    expect(migration).toContain('LIKE \'%\' || normalized_location || \'%\'');
  });

  it('validates tour selection through a PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        success: true,
        code: null,
        message: 'Monteverde Quetzal Tour is selected and has 5 slots available.',
        id: 1,
        name: 'Monteverde Quetzal Tour',
        price: '120.00',
        available_slots: 5,
        location: 'Monteverde',
        duration_hours: 4,
        difficulty: 'moderate',
      }],
    });

    await expect(tourQueries.selectTour({
      tourId: 1,
      participants: 2,
    })).resolves.toMatchObject({
      success: true,
      tour: {
        id: 1,
      },
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('select_tour'),
      [1, 2]
    );
  });
});
