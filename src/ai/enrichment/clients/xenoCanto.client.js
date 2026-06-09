import env from '../../../config/env.js';
import HttpClient, { assertConfigValue } from '../../../utils/httpClient.js';
import ApiRateLimiter from '../../../utils/rateLimiter.js';

const COSTA_RICA_BIRD_SONG_QUERY = [
  'cnt:"costa rica"',
  'grp:birds',
  'type:song',
  'q:">C"',
  'len:"<120"',
].join(' ');

/**
 * @typedef {Object} XenoCantoRecording
 * @property {string} id
 * @property {string} gen
 * @property {string} sp
 * @property {string} grp
 * @property {string} en
 * @property {string} rec
 * @property {string} cnt
 * @property {string} loc
 * @property {string} lat
 * @property {string} lon
 * @property {string} type
 * @property {string} url
 * @property {string} file
 * @property {Object} sono Spectrogram image URLs keyed by size.
 * @property {Object} osci Oscillogram image URLs keyed by size.
 * @property {string} q Recording quality.
 * @property {string} length Recording length, for example "1:11".
 * @property {string} date Recording date.
 *
 * @typedef {Object} XenoCantoResponse
 * @property {string} numRecordings
 * @property {string} numSpecies
 * @property {number} page
 * @property {number} numPages
 * @property {XenoCantoRecording[]} recordings
 */

function isPositivePageNumber(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1;
}

function isXenoCantoResponse(payload) {
  return payload
    && typeof payload === 'object'
    && typeof payload.numRecordings === 'string'
    && typeof payload.numSpecies === 'string'
    && isPositivePageNumber(payload.page)
    && isPositivePageNumber(payload.numPages)
    && Array.isArray(payload.recordings)
    && payload.recordings.every((recording) => recording && typeof recording === 'object');
}

class XenoCantoClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? env.xenoCantoApiKey;
    assertConfigValue(this.apiKey, 'XENO_CANTO_API_KEY');

    const rateLimiter = options.rateLimiter || new ApiRateLimiter({
      maxRequests: env.externalApiRateLimitMaxRequests,
      windowMs: env.externalApiRateLimitWindowMs,
    });

    this.httpClient = options.httpClient || new HttpClient({
      baseUrl: options.baseUrl ?? env.xenoCantoApiBaseUrl,
      baseUrlEnvName: 'XENO_CANTO_API_BASE_URL',
      provider: 'Xeno-canto',
      fetchImpl: options.fetchImpl,
      rateLimiter,
    });
  }

  /**
   * Fetches Costa Rica bird song recordings. By default this follows the
   * provider's `numPages` value and returns one response with combined
   * recordings. Pass `{ paginate: false, page: 1 }` to fetch a single page.
   *
   * @returns {Promise<XenoCantoResponse>}
   */
  async getCostaRicaBirdSongs(options = {}) {
    const firstPage = options.page ?? 1;
    const firstResponse = await this.getCostaRicaBirdSongsPage({
      ...options,
      page: firstPage,
    });

    if (options.paginate === false || Number(firstResponse.numPages) <= Number(firstResponse.page)) {
      return firstResponse;
    }

    const remainingPages = [];

    for (let page = Number(firstResponse.page) + 1; page <= Number(firstResponse.numPages); page += 1) {
      remainingPages.push(this.getCostaRicaBirdSongsPage({
        ...options,
        page,
      }));
    }

    const responses = await Promise.all(remainingPages);

    return {
      numRecordings: firstResponse.numRecordings,
      numSpecies: firstResponse.numSpecies,
      page: firstResponse.page,
      numPages: firstResponse.numPages,
      recordings: [
        ...firstResponse.recordings,
        ...responses.flatMap((response) => response.recordings),
      ],
    };
  }

  async getCostaRicaBirdSongsPage(options = {}) {
    return this.httpClient.get('/api/3/recordings', {
      query: {
        query: options.query || COSTA_RICA_BIRD_SONG_QUERY,
        key: this.apiKey,
        per_page: options.perPage ?? 500,
        page: options.page ?? 1,
      },
      signal: options.signal,
      validate: isXenoCantoResponse,
    });
  }
}

export {
  COSTA_RICA_BIRD_SONG_QUERY,
  isXenoCantoResponse,
};
export default XenoCantoClient;
