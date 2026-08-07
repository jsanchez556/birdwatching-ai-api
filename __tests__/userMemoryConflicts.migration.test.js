import { readFile } from 'node:fs/promises';

describe('user memory conflict migration', () => {
  let sql;

  beforeAll(async () => {
    sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');
  });

  it('adds conflict identity, resolution, and supersession audit metadata', () => {
    expect(sql).toMatch(/conflict_key text/i);
    expect(sql).toMatch(/resolution text DEFAULT 'none'::text NOT NULL/i);
    expect(sql).toMatch(/superseded_at timestamp with time zone/i);
    expect(sql).toContain('idx_user_memories_active_conflict_key');
  });

  it('allows supersession only for explicit recent corrections', () => {
    expect(sql).toMatch(/CREATE FUNCTION public\.save_user_memory_v2/i);
    expect(sql).toContain("p_resolution = 'explicit_recent_correction'");
    expect(sql).toContain('supersession requires explicit recent correction');
    expect(sql).toContain("resolution = 'explicit_recent_correction'");
    expect(sql).toContain('superseded_at = CURRENT_TIMESTAMP');
  });

  it('preserves inactive history through an owner-scoped audit function', () => {
    expect(sql).toMatch(/CREATE FUNCTION public\.get_user_memory_history/i);
    expect(sql).toContain('WHERE um.user_id = p_user_id');
    expect(sql).not.toContain('DELETE FROM user_memories');
  });
});
