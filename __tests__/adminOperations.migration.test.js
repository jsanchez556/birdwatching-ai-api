import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('admin operations migrations', () => {
  it('targets the feature-control primary key without an ambiguous feature reference', async () => {
    const migration = await readFile(
      path.resolve(
        __dirname,
        '../src/db/migrations/003_functions.sql'
      ),
      'utf8'
    );

    expect(migration).toMatch(/ON CONFLICT ON CONSTRAINT ai_feature_controls_pkey DO UPDATE/i);
    expect(migration).not.toContain('ON CONFLICT (feature)');
    expect(migration).toMatch(/RETURNS TABLE\s*\(feature text,/i);
  });
});
