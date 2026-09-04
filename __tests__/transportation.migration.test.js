import { readFile } from 'node:fs/promises';

describe('transportation migration', () => {
  test('owns vehicles, bookings, idempotent writes, and three seeded vehicles', async () => {
    const sql = await readFile(new URL('../src/db/migrations/006_transportation_service.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.transport_vehicles/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.transport_bookings/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_transport_booking/);
    expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/transport_quote_stale/);
    expect(sql.match(/\('(?:jac-sunray|toyota-hiace|toyota-hiace-top-roof)'/g)).toHaveLength(3);
    expect(sql).toContain("'vehicles/jacsunray.jpg'");
    expect(sql).toContain("'vehicles/hiacetb.jpeg'");
    expect(sql).toContain("'vehicles/hiaceht.jpg'");
  });
});
