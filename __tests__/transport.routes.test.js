import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/api/app.js';
import env from '../src/config/env.js';

describe('transport routes', () => {
  const originalKey = env.transport.googleMapsApiKey;

  afterEach(() => {
    env.transport.googleMapsApiKey = originalKey;
    jest.restoreAllMocks();
  });

  test('rejects malformed route payloads before provider execution', async () => {
    const provider = jest.spyOn(global, 'fetch');
    const response = await request(app).post('/transport/routes/quote').send({ origin: { placeId: 'same' }, extra: true });
    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(provider).not.toHaveBeenCalled();
  });

  test('returns an authoritative normalized Costa Rica route quote', async () => {
    env.transport.googleMapsApiKey = 'test-key';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'origin', formattedAddress: 'San José, Costa Rica', location: { latitude: 9.93, longitude: -84.08 }, addressComponents: [{ shortText: 'CR', types: ['country'] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'destination', formattedAddress: 'Bijagua, Costa Rica', location: { latitude: 10.73, longitude: -85.05 }, addressComponents: [{ shortText: 'CR', types: ['country'] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ distanceMeters: 202300, duration: '12300s', polyline: { encodedPolyline: 'abc' } }] }) });

    const response = await request(app).post('/transport/routes/quote').send({
      origin: { placeId: 'origin' }, destination: { placeId: 'destination' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { distanceKm: 202.3, durationMinutes: 205, encodedPolyline: 'abc' }, meta: {} });
    expect(response.body.data.routeToken).toEqual(expect.any(String));
  });

  test('rejects provider-confirmed locations outside the service country', async () => {
    env.transport.googleMapsApiKey = 'test-key';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'origin', formattedAddress: 'Costa Rica', location: { latitude: 9.9, longitude: -84 }, addressComponents: [{ shortText: 'CR', types: ['country'] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'destination', formattedAddress: 'Panama', location: { latitude: 9, longitude: -79.5 }, addressComponents: [{ shortText: 'PA', types: ['country'] }] }) });
    const response = await request(app).post('/transport/routes/quote').send({ origin: { placeId: 'origin' }, destination: { placeId: 'destination' } });
    expect(response.statusCode).toBe(422);
    expect(response.body.error.code).toBe('LOCATION_OUTSIDE_SERVICE_COUNTRY');
  });

  test('requires authentication for checkout context', async () => {
    const response = await request(app).get('/transport/checkout-context');
    expect(response.statusCode).toBe(401);
  });
});
