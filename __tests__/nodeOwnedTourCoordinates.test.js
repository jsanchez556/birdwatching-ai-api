import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';

const queries = { getById: jest.fn(), create: jest.fn(), update: jest.fn() };
await jest.unstable_mockModule('../src/db/queries/adminMaintenance.queries.js', () => ({ default: queries }));
const { default: service } = await import('../src/services/admin/adminMaintenance.service.js');

beforeEach(() => jest.clearAllMocks());

test('tour creation derives coordinates from the selected node and ignores client coordinate ownership', async () => {
  queries.getById.mockResolvedValue({ id: 4, lat: 10.25, lon: -84.75 });
  queries.create.mockResolvedValue({ id: 9, nodeId: 4, lat: 10.25, lon: -84.75 });
  await service.create('tours', { nodeId: 4, name: 'Forest walk' }, { authUser: { id: 7 } });
  expect(queries.create).toHaveBeenCalledWith('tours', expect.objectContaining({
    nodeId: 4, lat: 10.25, lon: -84.75, createdByUserId: 7,
  }));
});

test('tour saving fails clearly when its selected node has no coordinates', async () => {
  queries.getById.mockResolvedValue({ id: 4, lat: null, lon: null });
  await expect(service.create('tours', { nodeId: 4 }, { authUser: { id: 7 } }))
    .rejects.toMatchObject({ status: 422, code: 'NODE_COORDINATES_REQUIRED' });
  expect(queries.create).not.toHaveBeenCalled();
});

test('migration makes node coordinates authoritative and propagates node moves', async () => {
  const sql = await readFile(new URL('../src/db/migrations/003_functions.sql', import.meta.url), 'utf8');
  expect(sql).toContain('derive_tour_coordinates_from_node');
  expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF node_id, lat, lon ON public\.tours/i);
  expect(sql).toContain('propagate_node_coordinates_to_tours');
  expect(sql).toMatch(/AFTER UPDATE OF lat, lon ON public\.node/i);
  const createTourFunction = sql.match(
    /CREATE FUNCTION public\.admin_create_tour[\s\S]*?END; \$\$;/i
  )?.[0] || '';
  const updateTourFunction = sql.match(
    /CREATE FUNCTION public\.admin_update_tour[\s\S]*?END; \$\$;/i
  )?.[0] || '';
  expect(createTourFunction).not.toMatch(/p_data->>'lat'/);
  expect(createTourFunction).not.toMatch(/p_data->>'lon'/);
  expect(updateTourFunction).not.toMatch(/p_data->>'lat'/);
  expect(updateTourFunction).not.toMatch(/p_data->>'lon'/);
});
