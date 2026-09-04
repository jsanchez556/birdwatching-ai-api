import env from '../../config/env.js';
import HttpError from '../../utils/httpError.js';

function requireConfig() {
  if (!env.transport.googleMapsApiKey) {
    throw new HttpError(503, 'Route calculation is temporarily unavailable.', {
      code: 'MAPS_NOT_CONFIGURED', expose: true,
    });
  }
}

function countryCodeFromPlace(place) {
  return place.addressComponents?.find((part) => part.types?.includes('country'))?.shortText?.toUpperCase() || null;
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(503, 'Route calculation is temporarily unavailable.', {
      code: 'MAPS_UNAVAILABLE', expose: true,
    });
  }
  if (!response.ok) {
    throw new HttpError(502, 'The map provider could not calculate this route.', {
      code: 'MAPS_PROVIDER_ERROR', expose: true,
    });
  }
  return response.json();
}

class GoogleMapsAdapter {
  async getPlace(placeId) {
    requireConfig();
    const place = await requestJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': env.transport.googleMapsApiKey,
        'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
      },
    });
    return {
      placeId: place.id,
      label: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      countryCode: countryCodeFromPlace(place),
    };
  }

  async computeRoute(origin, destination) {
    requireConfig();
    const data = await requestJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.transport.googleMapsApiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });
    const route = data.routes?.[0];
    const durationSeconds = Number(String(route?.duration || '').replace(/s$/, ''));
    if (!route?.distanceMeters || !Number.isFinite(durationSeconds)) {
      throw new HttpError(422, 'No driving route is available for these locations.', {
        code: 'ROUTE_NOT_FOUND',
      });
    }
    return {
      distanceMeters: Number(route.distanceMeters),
      durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
      encodedPolyline: route.polyline?.encodedPolyline || null,
    };
  }
}

export default new GoogleMapsAdapter();
