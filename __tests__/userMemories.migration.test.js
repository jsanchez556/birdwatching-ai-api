import { readFile } from 'node:fs/promises';

describe('user memory migration', () => {
  let sql;

  beforeAll(async () => {
    sql = await readFile(new URL('../src/db/migrations/028_create_user_memories.sql', import.meta.url), 'utf8');
  });

  it('creates a user-scoped, provenance-bearing, editable memory store', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_memories');
    expect(sql).toContain('user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE');
    expect(sql).toContain('source_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL');
    expect(sql).toContain('confidence NUMERIC(4, 3)');
    expect(sql).toContain('expires_at TIMESTAMPTZ');
    expect(sql).toContain('is_user_editable BOOLEAN NOT NULL DEFAULT TRUE');
    expect(sql).toContain('is_active BOOLEAN NOT NULL DEFAULT TRUE');
    expect(sql).toContain("'accessibility_requirements'");
    expect(sql).toContain("'budget_ranges'");
  });

  it('deduplicates active values and retrieves only active non-expired rows', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memories_active_fingerprint');
    expect(sql).toContain('WHERE is_active = TRUE');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_active_user_memories');
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
