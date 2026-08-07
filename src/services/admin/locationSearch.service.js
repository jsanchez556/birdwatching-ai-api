import env from '../../config/env.js';
import HttpError from '../../utils/httpError.js';

const MAX_RESULTS = 6;

function normalizeQuery(query = {}) {
  const value = typeof query.q === 'string' ? query.q.trim() : '';
  if (value.length < 2 || value.length > 160) {
    throw new HttpError(400, 'Location search must contain 2 to 160 characters.', {
      code: 'INVALID_LOCATION_SEARCH',
    });
  }
  const countryCode = typeof query.countryCode === 'string'
    ? query.countryCode.trim().toLowerCase()
    : '';
  if (countryCode && !/^[a-z]{2}$/.test(countryCode)) {
    throw new HttpError(400, 'countryCode must contain exactly two letters.', {
      code: 'INVALID_COUNTRY_CODE',
    });
  }
  return { value, countryCode };
}

function normalizeReverseQuery(query = {}) {
  const latitude = query.latitude === '' || query.latitude === null || query.latitude === undefined
    ? Number.NaN
    : Number(query.latitude);
  const longitude = query.longitude === '' || query.longitude === null || query.longitude === undefined
    ? Number.NaN
    : Number(query.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new HttpError(400, 'latitude must be between -90 and 90.', {
      code: 'INVALID_LOCATION_COORDINATES',
    });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'longitude must be between -180 and 180.', {
      code: 'INVALID_LOCATION_COORDINATES',
    });
  }
  return { latitude, longitude };
}

function normalizeResult(result) {
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    name: String(result.display_name || result.name || 'Map location').slice(0, 500),
    latitude,
    longitude,
  };
}

class LocationSearchService {
  async search(query, { fetchImpl = fetch } = {}) {
    const { value, countryCode } = normalizeQuery(query);
    const url = new URL(`${env.geocoding.baseUrl}/search`);
    url.searchParams.set('q', value);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(MAX_RESULTS));
    url.searchParams.set('addressdetails', '0');
    if (countryCode) url.searchParams.set('countrycodes', countryCode);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': env.geocoding.userAgent },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(503, 'Location search is temporarily unavailable. You can still place the marker manually.', {
        code: 'GEOCODING_UNAVAILABLE',
      });
    }
    if (!response.ok) {
      throw new HttpError(502, 'The location provider could not complete the search.', {
        code: 'GEOCODING_PROVIDER_ERROR',
      });
    }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!Array.isArray(payload)) {
      throw new HttpError(502, 'The location provider returned an invalid response.', {
        code: 'GEOCODING_PROVIDER_ERROR',
      });
    }
    return payload.map(normalizeResult).filter(Boolean).slice(0, MAX_RESULTS);
  }

  async reverse(query, { fetchImpl = fetch } = {}) {
    const { latitude, longitude } = normalizeReverseQuery(query);
    const url = new URL(`${env.geocoding.baseUrl}/reverse`);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '0');
    url.searchParams.set('zoom', '18');
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': env.geocoding.userAgent },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(503, 'Location lookup is temporarily unavailable. The selected coordinates are still available.', {
        code: 'GEOCODING_UNAVAILABLE',
      });
    }
    if (!response.ok) {
      throw new HttpError(502, 'The location provider could not identify these coordinates.', {
        code: 'GEOCODING_PROVIDER_ERROR',
      });
    }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      throw new HttpError(502, 'The location provider returned an invalid response.', {
        code: 'GEOCODING_PROVIDER_ERROR',
      });
    }
    return normalizeResult(payload);
  }
}

export { normalizeQuery, normalizeResult, normalizeReverseQuery };
export default new LocationSearchService();
