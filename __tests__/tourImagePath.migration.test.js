import { readFile } from 'node:fs/promises';

describe('tour image path migration', () => {
  it('installs the nullable path without a database path-format constraint', async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL('../src/db/migrations/001_schema.sql', import.meta.url), 'utf8'),
      readFile(new URL('../src/db/migrations/004_tour_image_path.sql', import.meta.url), 'utf8'),
    ]);

    expect(schema).toMatch(/image_path text/i);
    expect(schema).toContain('tours_image_path_check');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS image_path text/i);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS tours_image_path_check/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_set_tour_image_path/i);
    expect(migration).not.toMatch(/ADD CONSTRAINT tours_image_path_check/i);
    expect(migration).not.toMatch(/RAISE EXCEPTION[\s\S]*Tour image path/i);
  });
});
