import { readFile } from 'node:fs/promises';

describe('transfer domain migration', () => {
  it('uses transfer identifiers in the consolidated schema', async () => {
    const schema = await readFile(
      new URL('../src/db/migrations/001_schema.sql', import.meta.url),
      'utf8'
    );
    const functions = await readFile(
      new URL('../src/db/migrations/003_functions.sql', import.meta.url),
      'utf8'
    );

    expect(schema).toContain('CREATE TABLE public.transfers');
    expect(schema).toContain('CREATE TABLE public.transfer_by_node');
    expect(schema).toContain('needs_transfer boolean');
    expect(functions).toContain("'transferRequired'");
  });

  it('provides a forward-only deployed-data rename', async () => {
    const migration = await readFile(
      new URL('../src/db/migrations/005_transfer_domain_rename.sql', import.meta.url),
      'utf8'
    );

    expect(migration).toContain('ALTER TABLE public.transportations RENAME TO transfers');
    expect(migration).toContain('RENAME COLUMN needs_transportation TO needs_transfer');
    expect(migration).toContain('pg_temp.rename_transfer_document');
    expect(migration).toContain("to_regclass('public.tool_result_references') IS NOT NULL");
    expect(migration).toContain('COMMIT;');
  });
});
