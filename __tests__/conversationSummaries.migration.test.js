import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('conversation summaries migration', () => {
  it('creates versioned summary persistence and owner-scoped helper functions', async () => {
    const sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(path.resolve(__dirname, '../src/db/migrations', file), 'utf8')))).join('\n');

    expect(sql).toMatch(/CREATE TABLE public\.conversation_summaries/i);
    expect(sql).toMatch(/UNIQUE \(conversation_id, version\)/i);
    expect(sql).toMatch(/compacted_message_ids bigint\[\]/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.get_latest_conversation_summary/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.get_conversation_messages_for_compaction/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.save_conversation_summary/i);
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(sql).toContain("USING ERRCODE = '40001'");
  });
});
