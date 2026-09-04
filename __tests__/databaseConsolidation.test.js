import { readFile, readdir } from 'node:fs/promises';

const migrationsUrl = new URL('../src/db/migrations/', import.meta.url);

describe('consolidated database migrations', () => {
  let schema;
  let seed;
  let functions;

  beforeAll(async () => {
    [schema, seed, functions] = await Promise.all([
      readFile(new URL('001_schema.sql', migrationsUrl), 'utf8'),
      readFile(new URL('002_seed.sql', migrationsUrl), 'utf8'),
      readFile(new URL('003_functions.sql', migrationsUrl), 'utf8'),
    ]);
  });

  it('keeps the consolidated baseline followed by explicit incremental migrations', async () => {
    const files = (await readdir(migrationsUrl)).sort();
    expect(files).toEqual([
      '001_schema.sql',
      '002_seed.sql',
      '003_functions.sql',
      '004_tour_image_path.sql',
      '005_transfer_domain_rename.sql',
      '006_transportation_service.sql',
    ]);
  });

  it('owns extensions, active write contracts, and atomic persistence workflows', () => {
    expect(schema).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    for (const functionName of [
      'create_user',
      'create_refresh_token',
      'revoke_refresh_token',
      'record_usage_log',
      'upsert_knowledge_document',
      'replace_knowledge_chunks',
      'create_tour_reservation_for_conversation',
      'upsert_tour_cart_item',
    ]) {
      expect(functions).toContain(`CREATE FUNCTION public.${functionName}`);
    }
    expect(schema).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION/i);
    expect(schema).not.toMatch(/CREATE TRIGGER/i);
    expect(functions).toMatch(/CREATE TRIGGER users_set_updated_at/i);
    expect(functions).not.toContain('CREATE FUNCTION public.save_user_memory(');
    expect(functions).not.toContain('CREATE FUNCTION public.tour_owner_is_publicly_eligible(');
  });

  it('contains only sanitized user seed values and resets every explicit-id sequence', () => {
    expect(seed).toContain('admin@example.test');
    expect(seed).toContain('guide@example.test');
    expect(seed).not.toMatch(/@gmail\.com|@hotmail\.com|@outlook\.com/i);
    for (const sequence of [
      'birds_id_seq',
      'country_id_seq',
      'node_id_seq',
      'plans_id_seq',
      'users_id_seq',
      'zone_id_seq',
    ]) {
      expect(seed).toContain(`public.${sequence}`);
    }
  });
});
