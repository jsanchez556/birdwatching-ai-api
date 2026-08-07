import { readFile } from 'node:fs/promises';

describe('user memory migration', () => {
  let sql;

  beforeAll(async () => {
    sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');
  });

  it('creates a user-scoped, provenance-bearing, editable memory store', () => {
    expect(sql).toMatch(/CREATE TABLE public\.user_memories/i);
    expect(sql).toMatch(/user_id bigint NOT NULL/i);
    expect(sql).toMatch(/user_memories_user_id_fkey FOREIGN KEY \(user_id\).*ON DELETE CASCADE/i);
    expect(sql).toMatch(/source_message_id bigint/i);
    expect(sql).toMatch(/user_memories_source_message_id_fkey.*ON DELETE SET NULL/i);
    expect(sql).toMatch(/confidence numeric\(4,3\)/i);
    expect(sql).toMatch(/expires_at timestamp with time zone/i);
    expect(sql).toMatch(/is_user_editable boolean DEFAULT true NOT NULL/i);
    expect(sql).toMatch(/is_active boolean DEFAULT true NOT NULL/i);
    expect(sql).toContain("'accessibility_requirements'");
    expect(sql).toContain("'budget_ranges'");
  });

  it('deduplicates active values and retrieves only active non-expired rows', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX idx_user_memories_active_fingerprint/i);
    expect(sql).toContain('WHERE is_active = TRUE');
    expect(sql).toMatch(/CREATE FUNCTION public\.get_active_user_memories/i);
    expect(sql).toContain('um.expires_at > CURRENT_TIMESTAMP');
    expect(sql).toContain('ON CONFLICT (user_id, category, content_fingerprint) WHERE is_active = TRUE');
  });

  it('serializes writes and validates source ownership and supersession atomically', () => {
    expect(sql).toContain('pg_advisory_xact_lock(p_user_id)');
    expect(sql).toContain('INNER JOIN conversations AS c ON c.id = m.conversation_id');
    expect(sql).toContain('source_owner_id IS DISTINCT FROM p_user_id');
    expect(sql).toContain('invalid memories selected for supersession');
    expect(sql).toContain('superseded_by_id = inserted_memory.id');
  });
});
