import { calculateFare } from '../src/services/transport.service.js';
import { validateRouteQuote, validateTransportBooking, validateVehicleQuery } from '../src/api/validators/transport.validator.js';

describe('transport pricing and validation', () => {
  test('uses integer-cent distance pricing', () => {
    expect(calculateFare(202300, { pricePerKm: '2.40', minimumFare: '95.00' })).toEqual({
      distanceCharge: '485.52', finalFare: '485.52', minimumFareApplied: false,
    });
  });

  test('applies a minimum fare', () => {
    expect(calculateFare(10000, { pricePerKm: '1.35', minimumFare: '55.00' })).toEqual({
      distanceCharge: '13.50', finalFare: '55.00', minimumFareApplied: true,
    });
  });

  test('rejects unknown route fields', () => {
    const result = validateRouteQuote({ body: { origin: { placeId: 'a', distance: 3 }, destination: { placeId: 'b' } } });
    expect(result.errors).toContain('origin.distance is not allowed');
  });

  test('normalizes vehicle filters', () => {
    expect(validateVehicleQuery({ query: { routeToken: 'token', passengers: '2', luggage: '0' } })).toMatchObject({
      errors: [], value: { routeToken: 'token', passengers: 2, luggage: 0 },
    });
  });

  test('requires safe booking contact and payment input', () => {
    const result = validateTransportBooking({ body: {
      routeToken: 'route', quoteToken: 'quote', pickupAt: '2030-02-03T12:00:00-06:00',
      passengers: 2, luggage: 1, contact: { firstName: 'Ana', lastName: 'Mora', email: 'ana@example.com', phone: '+50688888888' },
      comments: '', paymentMethod: { type: 'pay_on_arrival' }, idempotencyKey: '7a0d4b39-5f71-4e97-8851-4601925ca510',
    } });
    expect(result.errors).toEqual([]);
  });
});
