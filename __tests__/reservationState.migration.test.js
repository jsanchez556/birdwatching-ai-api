import { readFile } from 'node:fs/promises';

describe('reservation conversation state migration', () => {
  it('defines versioned state, append-only audit, optimistic mutation, and atomic booking', async () => {
    const sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');

    expect(sql).toMatch(/CREATE TABLE public\.reservation_conversation_states/i);
    expect(sql).toMatch(/CREATE TABLE public\.reservation_state_audit_events/i);
    expect(sql).toContain("state_row.proposed_values - ARRAY['customerName', 'customerEmail']");
    expect(sql).toMatch(/new_version\s*=\s*\(?previous_version\s*\+\s*1\)?/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.mutate_reservation_conversation_state/i);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("USING ERRCODE = '40001'");
    expect(sql).toContain("only confirmed reservation state can be cancelled");
    expect(sql).toContain("reservation state is not ready for confirmation");
    expect(sql).toMatch(/CREATE FUNCTION public\.book_reservation_from_state/i);
    expect(sql).toContain("state_row.status <> 'ready_for_confirmation'");
    expect(sql).toContain('booking_result := create_tour_reservation_for_date(');
    expect(sql).toContain("status = 'confirmed'");
    expect(sql.indexOf('booking_result := create_tour_reservation_for_date(')).toBeLessThan(sql.lastIndexOf("status = 'confirmed'"));
  });
});
