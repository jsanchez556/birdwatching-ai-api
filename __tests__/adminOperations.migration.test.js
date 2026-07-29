import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('admin operations migrations', () => {
  it('targets the feature-control primary key without an ambiguous feature reference', async () => {
    const migration = await readFile(
      path.resolve(
        __dirname,
        '../src/db/migrations/025_create_admin_operations.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      'ON CONFLICT ON CONSTRAINT ai_feature_controls_pkey DO UPDATE'
    );
    expect(migration).not.toContain('ON CONFLICT (feature)');
    expect(migration).toContain('RETURNS TABLE (\n  feature TEXT,');
  });
});
