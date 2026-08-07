import { readFile } from 'node:fs/promises';

describe('nature tour and maintenance migration', () => {
  let sql;

  beforeAll(async () => {
    sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');
  });

  it('defines the final required activity and scheduling columns', () => {
    expect(sql).toMatch(/type text DEFAULT 'Birdwatching'::text NOT NULL/i);
    expect(sql).toMatch(/tour_type text DEFAULT 'unscheduled'::text NOT NULL/i);
  });

  it('does not add legacy country boundary fields', () => {
    expect(sql).not.toContain('bounds_north');
    expect(sql).not.toContain('bounds_south');
    expect(sql).not.toContain('bounds_east');
    expect(sql).not.toContain('bounds_west');
  });

  it('keeps admin writes inside database functions', () => {
    for (const resource of ['country', 'zone', 'node', 'bird', 'bird_by_node', 'tour']) {
      expect(sql).toMatch(new RegExp(`CREATE FUNCTION public\\.admin_create_${resource}`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE FUNCTION public\\.admin_update_${resource}`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE FUNCTION public\\.admin_delete_${resource}`, 'i'));
    }
  });
});

describe('country map viewport migration', () => {
  let viewportSql;

  beforeAll(async () => {
    viewportSql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');
  });

  it('defines nullable validated viewport fields', () => {
    expect(viewportSql).toMatch(/latitude numeric\(9,6\)/i);
    expect(viewportSql).toMatch(/longitude numeric\(9,6\)/i);
    expect(viewportSql).toMatch(/zoom smallint/i);
    expect(viewportSql).toContain('country_viewport_latitude_check');
    expect(viewportSql).toContain('country_viewport_longitude_check');
    expect(viewportSql).toContain('country_viewport_zoom_check');
  });

  it('extends country create and update functions with center and zoom fields', () => {
    expect(viewportSql).toMatch(/CREATE FUNCTION public\.admin_create_country/i);
    expect(viewportSql).toMatch(/CREATE FUNCTION public\.admin_update_country/i);
    expect(viewportSql).toContain("p_data->>'latitude'");
    expect(viewportSql).toContain("p_data->>'longitude'");
    expect(viewportSql).toContain("p_data->>'zoom'");
    expect(viewportSql).not.toContain('bounds_north');
  });
});

describe('consolidated country shape', () => {
  it('omits every legacy boundary column', async () => {
    const removalSql = await readFile(new URL('../src/db/migrations/001_schema.sql', import.meta.url), 'utf8');
    for (const column of ['bounds_north', 'bounds_south', 'bounds_east', 'bounds_west']) {
      expect(removalSql).not.toContain(column);
    }
  });
});
