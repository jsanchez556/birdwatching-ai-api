import { readFile } from 'node:fs/promises';

describe('user memory conflict migration', () => {
  let sql;

  beforeAll(async () => {
    sql = await readFile(new URL(
      '../src/db/migrations/029_add_user_memory_conflict_resolution.sql',
      import.meta.url
    ), 'utf8');
  });

  it('adds conflict identity, resolution, and supersession audit metadata', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS conflict_key TEXT');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT 'none'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ');
    expect(sql).toContain('idx_user_memories_active_conflict_key');
  });

  it('allows supersession only for explicit recent corrections', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION save_user_memory_v2');
    expect(sql).toContain("p_resolution = 'explicit_recent_correction'");
    expect(sql).toContain('supersession requires explicit recent correction');
    expect(sql).toContain("resolution = 'explicit_recent_correction'");
    expect(sql).toContain('superseded_at = CURRENT_TIMESTAMP');
  });

  it('preserves inactive history through an owner-scoped audit function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_user_memory_history');
    expect(sql).toContain('WHERE um.user_id = p_user_id');
    expect(sql).not.toContain('DELETE FROM user_memories');
  });
});
