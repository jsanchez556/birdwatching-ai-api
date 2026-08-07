import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: mockQuery },
}));

const { default: queries, buildListParameters, LIST_SQL } = await import(
  '../src/db/queries/adminMaintenance.queries.js'
);

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
});

test('binds birds-by-node node filtering contiguously without untyped placeholder gaps', async () => {
  await queries.list('birds-by-node', {
    search: '', limit: 25, offset: 0, nodeId: 17,
  });

  expect(LIST_SQL['birds-by-node']).toContain('$4::integer');
  expect(LIST_SQL['birds-by-node']).not.toContain('$6');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.any(String),
    ['', 25, 0, 17]
  );
});

test('builds resource-specific list bindings while retaining complete tour filters', () => {
  expect(buildListParameters('countries', {
    search: 'costa', limit: 25, offset: 0,
  })).toEqual(['costa', 25, 0]);
  expect(buildListParameters('tours', {
    search: '', limit: 25, offset: 0, countryId: 1, zoneId: 2, nodeId: 3,
    type: 'Night walk', ownerId: 7, isActive: false, difficulty: 'moderate',
  })).toEqual(['', 25, 0, 1, 2, 3, 'Night walk', 7, false, 'moderate']);
});

test('country list exposes numeric viewport fields through the existing mapper', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 1, name: 'Costa Rica', acr: 'CR', latitude: '9.750000', longitude: '-84.200000',
    zoom: '7', total_count: '1',
  }] });
  const result = await queries.list('countries', { search: '', limit: 25, offset: 0 });
  expect(result.rows[0]).toMatchObject({ latitude: 9.75, longitude: -84.2, zoom: 7 });
});

test('tour list exposes the persisted image path', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 7, name: 'Cloud forest walk',
    image_path: 'tours/11111111-1111-4111-8111-111111111111.png',
    updated_at: '2026-09-03T23:20:00.000Z', total_count: '1',
  }] });

  const result = await queries.list('tours', {
    search: '', limit: 25, offset: 0,
  });

  expect(LIST_SQL.tours).toContain('t.image_path');
  expect(result.rows[0]).toMatchObject({
    id: 7, imagePath: 'tours/11111111-1111-4111-8111-111111111111.png',
    imageVersion: '1788477600000',
  });
});

test('persists a tour image path through the dedicated database function', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    entity: {
      id: 7, name: 'Cloud forest walk',
      image_path: 'tours/11111111-1111-4111-8111-111111111111.png',
    },
  }] });

  await expect(queries.setTourImagePath(
    7, 'tours/11111111-1111-4111-8111-111111111111.png'
  )).resolves.toMatchObject({
    id: 7,
    imagePath: 'tours/11111111-1111-4111-8111-111111111111.png',
  });
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT admin_set_tour_image_path($1, $2) AS entity',
    [7, 'tours/11111111-1111-4111-8111-111111111111.png']
  );
});
