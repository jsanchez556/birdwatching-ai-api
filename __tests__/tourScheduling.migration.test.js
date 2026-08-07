import { readFile } from 'node:fs/promises';

describe('tour scheduling and date-aware reservation migration', () => {
  it('defines explicit types, occurrence inventory, date uniqueness, and locked capacity updates', async () => {
    const sql = (await Promise.all([
      '001_schema.sql',
      '003_functions.sql',
    ].map((file) => readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');

    expect(sql).toMatch(/tour_type\s*=\s*ANY\s*\(ARRAY\['scheduled'::text,\s*'unscheduled'::text\]\)/i);
    expect(sql).toMatch(/CREATE TABLE public\.tour_occurrences/i);
    expect(sql).toMatch(/remaining_spaces integer[^,]*NOT NULL/i);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('remaining_spaces = remaining_spaces - p_participants');
    expect(sql).toContain('idx_reservations_user_calendar_day');
    expect(sql).toContain('idx_reservations_email_calendar_day');
    expect(sql).toContain("'TOUR_DAY_CONFLICT'");
    expect(sql).toContain("'DATE_OUTSIDE_ITINERARY'");
    expect(sql).toContain("'PARTICIPANT_LIMIT_EXCEEDED'");
    expect(sql).toContain('GREATEST(selected_tour.minimum_price, selected_tour.price)');
  });
});
