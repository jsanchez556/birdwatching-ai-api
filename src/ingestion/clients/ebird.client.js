import env from '../../config/env.js';
import HttpClient, { assertConfigValue } from '../../utils/httpClient.js';
import ApiRateLimiter from '../../utils/rateLimiter.js';
import { COSTA_RICA_COUNTRY_CODE } from '../../utils/constants.utils.js';

/**
 * @typedef {string[]} EBirdSpeciesListResponse
 *
 * @typedef {Object} EBirdRecentObservation
 * @property {string} speciesCode
 * @property {string} comName
 * @property {string} sciName
 * @property {string} locId
 * @property {string} locName
 * @property {string} obsDt
 * @property {number} [howMany]
 * @property {number} lat
 * @property {number} lng
 * @property {boolean} obsValid
 * @property {boolean} obsReviewed
 * @property {boolean} locationPrivate
 * @property {string} subId
 *
 * @typedef {EBirdRecentObservation[]} EBirdRecentObservationsResponse
 */

function isSpeciesListResponse(payload) {
  return Array.isArray(payload)
    && payload.every((speciesCode) => typeof speciesCode === 'string');
}

function isRecentObservation(observation) {
  return observation
    && typeof observation === 'object'
    && typeof observation.speciesCode === 'string'
    && typeof observation.comName === 'string'
    && typeof observation.sciName === 'string'
    && typeof observation.locId === 'string'
    && typeof observation.locName === 'string'
    && typeof observation.obsDt === 'string'
    && typeof observation.lat === 'number'
    && typeof observation.lng === 'number'
    && typeof observation.obsValid === 'boolean'
    && typeof observation.obsReviewed === 'boolean'
    && typeof observation.locationPrivate === 'boolean'
    && typeof observation.subId === 'string';
}

function isRecentObservationsResponse(payload) {
  return Array.isArray(payload)
    && payload.every(isRecentObservation);
}

class EBirdClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? env.eBirdApiKey;
    assertConfigValue(this.apiKey, 'E_BIRD_API_KEY');

    const rateLimiter = options.rateLimiter || new ApiRateLimiter({
      maxRequests: 1,
      windowMs: 1500,
    });

    this.httpClient = options.httpClient || new HttpClient({
      baseUrl: options.baseUrl ?? env.eBirdApiBaseUrl,
      baseUrlEnvName: 'E_BIRD_API_BASE_URL',
      provider: 'eBird',
      fetchImpl: options.fetchImpl,
      rateLimiter,
    });
  }

  get headers() {
    return {
      'X-eBirdApiToken': this.apiKey,
    };
  }

  /**
   * @returns {Promise<EBirdSpeciesListResponse>}
   */
  async getSpeciesList(countryCode = COSTA_RICA_COUNTRY_CODE, options = {}) {
    return this.httpClient.get(`/product/spplist/${countryCode}`, {
      headers: this.headers,
      signal: options.signal,
      validate: isSpeciesListResponse,
    });
  }

  async getTaxo(species = null, options = {}) {
    return this.httpClient.get(`/ref/taxonomy/ebird`, {
      headers: this.headers,
      query: {
        fmt: 'json',
        species,
      },
      signal: options.signal,
    });
  }

  /**
   * @returns {Promise<EBirdRecentObservationsResponse>}
   */
  async getRecentObservations(countryCode = COSTA_RICA_COUNTRY_CODE, speciesCode, options = {}) {
    return this.httpClient.get(`/data/obs/${countryCode}/recent/${speciesCode}`, {
      headers: this.headers,
      query: {
        hotspot: true,
        back: 30,
      },
      validate: isRecentObservationsResponse,
      signal: options.signal,
    });
  }
}

export {
  isRecentObservationsResponse,
  isSpeciesListResponse,
};
export default EBirdClient;
