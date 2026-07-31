import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('conversation summaries migration', () => {
  it('creates versioned summary persistence and owner-scoped helper functions', async () => {
    const sql = await readFile(path.resolve(
      __dirname,
      '../src/db/migrations/026_create_conversation_summaries.sql'
    ), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS conversation_summaries');
    expect(sql).toContain('UNIQUE (conversation_id, version)');
    expect(sql).toContain('compacted_message_ids BIGINT[]');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_latest_conversation_summary');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_conversation_messages_for_compaction');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION save_conversation_summary');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("USING ERRCODE = '40001'");
  });
});
