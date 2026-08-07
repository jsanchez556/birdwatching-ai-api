import { jest } from '@jest/globals';
import locationSearchService, {
  normalizeQuery, normalizeResult, normalizeReverseQuery,
} from '../src/services/admin/locationSearch.service.js';

test('normalizes safe provider results without exposing provider fields', () => {
  expect(normalizeResult({ display_name: 'Monteverde, Costa Rica', lat: '10.3', lon: '-84.8', place_id: 99 }))
    .toEqual({ name: 'Monteverde, Costa Rica', latitude: 10.3, longitude: -84.8 });
  expect(normalizeResult({ lat: 'invalid', lon: '-84' })).toBeNull();
});

test('validates location text and optional country code', () => {
  expect(normalizeQuery({ q: ' Monteverde ', countryCode: 'CR' }))
    .toEqual({ value: 'Monteverde', countryCode: 'cr' });
  expect(() => normalizeQuery({ q: 'x' })).toThrow('2 to 160');
  expect(() => normalizeQuery({ q: 'San Jose', countryCode: 'Costa Rica' })).toThrow('two letters');
});

test('validates reverse-geocoding coordinates', () => {
  expect(normalizeReverseQuery({ latitude: '9.75', longitude: '-84.2' }))
    .toEqual({ latitude: 9.75, longitude: -84.2 });
  expect(() => normalizeReverseQuery({ latitude: '91', longitude: '-84.2' })).toThrow('latitude');
  expect(() => normalizeReverseQuery({ latitude: '9.75', longitude: '-181' })).toThrow('longitude');
});

test('reverse geocodes through the configured provider and returns a safe result', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ display_name: 'San José, Costa Rica', lat: '9.9325', lon: '-84.0796', place_id: 91 }),
  });
  await expect(locationSearchService.reverse({ latitude: 9.9325, longitude: -84.0796 }, { fetchImpl }))
    .resolves.toEqual({ name: 'San José, Costa Rica', latitude: 9.9325, longitude: -84.0796 });
  const providerUrl = fetchImpl.mock.calls[0][0];
  expect(providerUrl.pathname).toBe('/reverse');
  expect(providerUrl.searchParams.get('lat')).toBe('9.9325');
  expect(providerUrl.searchParams.get('lon')).toBe('-84.0796');
});

test('forwards exact reverse coordinates in latitude-longitude order without rounding', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ display_name: 'Bijagua, Costa Rica', lat: '10.733123456789', lon: '-85.044987654321' }),
  });
  await locationSearchService.reverse({
    latitude: 10.733123456789,
    longitude: -85.044987654321,
  }, { fetchImpl });
  const providerUrl = fetchImpl.mock.calls[0][0];
  expect(providerUrl.searchParams.get('lat')).toBe('10.733123456789');
  expect(providerUrl.searchParams.get('lon')).toBe('-85.044987654321');
});

test('reverse geocoding returns safe provider and network failures', async () => {
  await expect(locationSearchService.reverse({ latitude: 9.75, longitude: -84.2 }, {
    fetchImpl: jest.fn().mockRejectedValue(new Error('private provider detail')),
  })).rejects.toMatchObject({ status: 503, code: 'GEOCODING_UNAVAILABLE' });
  await expect(locationSearchService.reverse({ latitude: 9.75, longitude: -84.2 }, {
    fetchImpl: jest.fn().mockResolvedValue({ ok: false }),
  })).rejects.toMatchObject({ status: 502, code: 'GEOCODING_PROVIDER_ERROR' });
});
