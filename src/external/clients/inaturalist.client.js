import env from '../../config/env.js';
import ExternalHttpClient from '../httpClient.js';
import ExternalApiRateLimiter from '../rateLimiter.js';
import HttpError from '../../utils/httpError.js';

/**
 * @typedef {Object} INaturalistTaxaResponse
 * @property {number} total_results
 * @property {number} page
 * @property {number} per_page
 * @property {Array<Object>} results Provider taxa matches. Common fields include
 * id, rank, name, preferred_common_name, default_photo, wikipedia_url, and
 * conservation_status.
 */

function isTaxaSearchResponse(payload) {
  return payload
    && typeof payload === 'object'
    && typeof payload.total_results === 'number'
    && typeof payload.page === 'number'
    && typeof payload.per_page === 'number'
    && Array.isArray(payload.results)
    && payload.results.every((taxon) => taxon && typeof taxon === 'object');
}

class INaturalistClient {
  constructor(options = {}) {
    const rateLimiter = options.rateLimiter || new ExternalApiRateLimiter({
      maxRequests: 1,
      windowMs: 1000,
    });
    this.httpClient = options.httpClient || new ExternalHttpClient({
      baseUrl: options.baseUrl ?? env.iNaturalistApiBaseUrl,
      baseUrlEnvName: 'INATURALIST_API_BASE_URL',
      provider: 'iNaturalist',
      fetchImpl: options.fetchImpl,
      rateLimiter,
    });
  }

  /**
   * @returns {Promise<INaturalistTaxaResponse>}
   */
  async searchTaxaByName(name, options = {}) {
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      throw new HttpError(400, 'Taxa search name is required', {
        code: 'TAXA_SEARCH_NAME_REQUIRED',
      });
    }

    return this.httpClient.get('/taxa', {
      query: {
        q: trimmedName,
      },
      signal: options.signal,
      validate: isTaxaSearchResponse,
    });
  }
}

export {
  isTaxaSearchResponse,
};
export default INaturalistClient;
