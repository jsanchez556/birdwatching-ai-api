import { readFile } from 'node:fs/promises';

describe('reservation conversation state migration', () => {
  it('defines versioned state, append-only audit, optimistic mutation, and atomic booking', async () => {
    const sql = await readFile(
      new URL('../src/db/migrations/027_create_reservation_conversation_state.sql', import.meta.url),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS reservation_conversation_states');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS reservation_state_audit_events');
    expect(sql).toContain("state_row.proposed_values - ARRAY['customerName', 'customerEmail']");
    expect(sql).toContain('new_version = previous_version + 1');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION mutate_reservation_conversation_state');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("USING ERRCODE = '40001'");
    expect(sql).toContain("only confirmed reservation state can be cancelled");
    expect(sql).toContain("reservation state is not ready for confirmation");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION book_reservation_from_state');
    expect(sql).toContain("state_row.status <> 'ready_for_confirmation'");
    expect(sql).toContain('FROM create_tour_reservation(');
    expect(sql).toContain("status = 'confirmed'");
    expect(sql.indexOf('FROM create_tour_reservation(')).toBeLessThan(sql.lastIndexOf("status = 'confirmed'"));
  });
});
