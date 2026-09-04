import crypto from 'node:crypto';
import env from '../config/env.js';
import transportQueries from '../db/queries/transport.queries.js';
import googleMaps from '../providers/maps/googleMaps.adapter.js';
import HttpError from '../utils/httpError.js';
import { signTransportToken, verifyTransportToken } from '../utils/transportToken.utils.js';

function decimalToCents(value) {
  const normalized = String(value);
  const [whole, fraction = ''] = normalized.split('.');
  return (Number(whole) * 100) + Number(`${fraction}00`.slice(0, 2));
}

function centsToAmount(cents) { return (cents / 100).toFixed(2); }

function calculateFare(distanceMeters, vehicle) {
  const rateCents = decimalToCents(vehicle.pricePerKm);
  const minimumCents = decimalToCents(vehicle.minimumFare);
  const distanceChargeCents = Math.round((distanceMeters * rateCents) / 1000);
  const finalCents = Math.max(distanceChargeCents, minimumCents);
  return {
    distanceCharge: centsToAmount(distanceChargeCents), finalFare: centsToAmount(finalCents),
    minimumFareApplied: minimumCents > distanceChargeCents,
  };
}

function publicVehicle(vehicle) {
  return { id: vehicle.id, code: vehicle.code, name: vehicle.name, description: vehicle.description,
    vehicleType: vehicle.vehicleType, imagePath: vehicle.imagePath,
    passengerCapacity: vehicle.passengerCapacity, luggageCapacity: vehicle.luggageCapacity,
    pricePerKm: String(vehicle.pricePerKm), minimumFare: String(vehicle.minimumFare), currency: vehicle.currency };
}

class TransportService {
  async createRouteQuote({ origin, destination }) {
    if (origin.placeId === destination.placeId) throw new HttpError(422, 'Pickup and drop-off must be different.', { code: 'SAME_LOCATION' });
    const [resolvedOrigin, resolvedDestination] = await Promise.all([
      googleMaps.getPlace(origin.placeId), googleMaps.getPlace(destination.placeId),
    ]);
    const expectedCountry = env.transport.countryCode;
    if (resolvedOrigin.countryCode !== expectedCountry || resolvedDestination.countryCode !== expectedCountry) {
      throw new HttpError(422, `Both locations must be inside ${expectedCountry}.`, { code: 'LOCATION_OUTSIDE_SERVICE_COUNTRY' });
    }
    const route = await googleMaps.computeRoute(resolvedOrigin, resolvedDestination);
    const routePayload = { origin: resolvedOrigin, destination: resolvedDestination, ...route };
    const routeToken = signTransportToken(routePayload, 'route', env.transport.routeTokenTtlSeconds);
    return { routeToken, origin: resolvedOrigin, destination: resolvedDestination,
      distanceKm: Number((route.distanceMeters / 1000).toFixed(1)), durationMinutes: route.durationMinutes,
      encodedPolyline: route.encodedPolyline,
      expiresAt: new Date(Date.now() + env.transport.routeTokenTtlSeconds * 1000).toISOString() };
  }

  async listVehicles({ routeToken, passengers, luggage }) {
    const route = verifyTransportToken(routeToken, 'route');
    const vehicles = await transportQueries.listEligibleVehicles({ passengers, luggage });
    return vehicles.map((vehicle) => {
      const fare = calculateFare(route.distanceMeters, vehicle);
      const quotePayload = { routeToken, vehicleId: vehicle.id, passengers, luggage, ...fare,
        pricePerKm: String(vehicle.pricePerKm), minimumFare: String(vehicle.minimumFare), currency: vehicle.currency };
      return { ...publicVehicle(vehicle), ...fare,
        quoteToken: signTransportToken(quotePayload, 'quote', env.transport.quoteTokenTtlSeconds),
        quoteExpiresAt: new Date(Date.now() + env.transport.quoteTokenTtlSeconds * 1000).toISOString() };
    });
  }

  async getCheckoutContext(userId) {
    const row = await transportQueries.getCheckoutContext(userId);
    if (!row) throw new HttpError(404, 'User profile not found.', { code: 'USER_NOT_FOUND' });
    const parts = String(row.name || '').trim().split(/\s+/).filter(Boolean);
    return { contact: { firstName: parts.shift() || '', lastName: parts.join(' '), email: row.email, phone: '' },
      paymentMethod: null,
      paymentOptions: [{ type: 'pay_on_arrival', label: 'Pay on arrival' }] };
  }

  async createBooking(input, user) {
    const route = verifyTransportToken(input.routeToken, 'route');
    const quote = verifyTransportToken(input.quoteToken, 'quote');
    if (quote.routeToken !== input.routeToken || quote.passengers !== input.passengers || quote.luggage !== input.luggage) {
      throw new HttpError(409, 'The vehicle quote is stale. Please select a vehicle again.', { code: 'STALE_QUOTE' });
    }
    const pickupAt = new Date(input.pickupAt);
    if (!Number.isFinite(pickupAt.getTime()) || pickupAt <= new Date()) throw new HttpError(422, 'Pickup time must be in the future.', { code: 'INVALID_PICKUP_TIME' });
    const vehicle = await transportQueries.getVehicle(quote.vehicleId);
    if (!vehicle || vehicle.passengerCapacity < input.passengers || vehicle.luggageCapacity < input.luggage) {
      throw new HttpError(409, 'The selected vehicle is no longer available.', { code: 'VEHICLE_UNAVAILABLE' });
    }
    const fare = calculateFare(route.distanceMeters, vehicle);
    if (fare.finalFare !== quote.finalFare || String(vehicle.pricePerKm) !== quote.pricePerKm || String(vehicle.minimumFare) !== quote.minimumFare) {
      throw new HttpError(409, 'The vehicle price changed. Please request a new quote.', { code: 'STALE_QUOTE' });
    }
    const reference = `TR-${crypto.randomUUID().split('-')[0].toUpperCase()}`;
    let row;
    try {
      row = await transportQueries.createBooking([
        reference, input.idempotencyKey, user?.id || null, vehicle.id, input.pickupAt,
        JSON.stringify(route.origin), JSON.stringify(route.destination), (route.distanceMeters / 1000).toFixed(3),
        route.durationMinutes, input.passengers, input.luggage, JSON.stringify(publicVehicle(vehicle)),
        vehicle.pricePerKm, vehicle.minimumFare, fare.distanceCharge, fare.finalFare, vehicle.currency,
        JSON.stringify(input.contact), input.comments, input.paymentMethod.reference, input.paymentMethod.type,
      ]);
    } catch (error) {
      if (error.message === 'transport_vehicle_unavailable') {
        throw new HttpError(409, 'The selected vehicle is no longer available.', { code: 'VEHICLE_UNAVAILABLE' });
      }
      if (error.message === 'transport_quote_stale') {
        throw new HttpError(409, 'The vehicle price changed. Please request a new quote.', { code: 'STALE_QUOTE' });
      }
      throw error;
    }
    const persistedPickupAt = new Date(row.pickup_at).toISOString();
    if (Number(row.vehicle_id) !== vehicle.id
      || Number(row.passengers) !== input.passengers
      || Number(row.luggage) !== input.luggage
      || persistedPickupAt !== pickupAt.toISOString()) {
      throw new HttpError(409, 'The idempotency key was already used for another booking.', {
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    return { bookingReference: row.booking_reference, bookingStatus: row.booking_status,
      paymentStatus: row.payment_status, pickupAt: row.pickup_at, origin: row.origin, destination: row.destination,
      distanceKm: Number(row.distance_km), durationMinutes: Number(row.duration_minutes), passengers: row.passengers,
      luggage: row.luggage, vehicle: row.vehicle_snapshot, finalFare: row.final_fare, currency: row.currency };
  }
}

export { TransportService, calculateFare };
export default new TransportService();
