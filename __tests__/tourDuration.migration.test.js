import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('tour schedule and duration migration', () => {
  it('backfills explicit units and makes public scheduled availability occurrence-backed', () => {
    const sql = fs.readFileSync(
      path.resolve(dirname, '../src/db/migrations/004_tour_image_path.sql'),
      'utf8'
    );

    expect(sql).toMatch(/duration_value\s*=\s*duration_hours/i);
    expect(sql).toMatch(/duration_unit\s*=\s*'hours'/i);
    expect(sql).toMatch(/duration_unit IN \('hours', 'days'\)/i);
    expect(sql).toMatch(/tour_type = 'unscheduled'.*available_slots = 0/s);
    expect(sql).toMatch(/INSERT INTO public\.tour_occurrences/i);
    expect(sql).toMatch(/jsonb_array_length\(g\.occurrence_dates\) > 0/i);
    expect(sql).toMatch(/g\.start_date >\s*\(CURRENT_TIMESTAMP AT TIME ZONE 'America\/Costa_Rica'\)::date/i);
    expect(sql).toMatch(/g\.tour_type = 'unscheduled' AND g\.max_participants/i);
  });
});
