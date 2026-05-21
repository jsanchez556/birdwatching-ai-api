import { jest } from '@jest/globals';
import EBirdClient, {
  isRecentObservationsResponse,
  isSpeciesListResponse,
} from '../src/external/clients/ebird.client.js';
import INaturalistClient, {
  isTaxaSearchResponse,
} from '../src/external/clients/inaturalist.client.js';
import XenoCantoClient, {
  COSTA_RICA_BIRD_SONG_QUERY,
  isXenoCantoResponse,
} from '../src/external/clients/xenoCanto.client.js';
import WikiClient, {
  WIKI_RATE_LIMIT_MAX_REQUESTS,
  WIKI_RATE_LIMIT_WINDOW_MS,
} from '../src/external/clients/wiki.client.js';
import ExternalHttpClient from '../src/external/httpClient.js';
import ExternalApiRateLimiter from '../src/external/rateLimiter.js';

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function xenoCantoPayload(overrides = {}) {
  return {
    numRecordings: '2',
    numSpecies: '1',
    page: 1,
    numPages: 1,
    recordings: [
      {
        id: '774101',
        en: 'Chestnut-capped Warbler',
      },
    ],
    ...overrides,
  };
}

function iNaturalistPayload(overrides = {}) {
  return {
    total_results: 1,
    page: 1,
    per_page: 30,
    results: [{ name: 'Pharomachrus mocinno' }],
    ...overrides,
  };
}

function eBirdObservation(overrides = {}) {
  return {
    speciesCode: 'brnjay',
    comName: 'Brown Jay',
    sciName: 'Cyanocorax morio',
    locId: 'L436229',
    locName: 'Arenal Observatory Lodge',
    obsDt: '2026-05-19 11:37',
    howMany: 1,
    lat: 10.4369842,
    lng: -84.7096768,
    obsValid: true,
    obsReviewed: false,
    locationPrivate: false,
    subId: 'S342409626',
    ...overrides,
  };
}

describe('external API clients', () => {
  it('sends eBird API token header and species list endpoint', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(['resque1']));
    const client = new EBirdClient({
      baseUrl: 'https://api.ebird.test/v2',
      apiKey: 'ebird-key',
      fetchImpl,
    });

    await expect(client.getSpeciesList()).resolves.toEqual(['resque1']);

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://api.ebird.test/v2/product/spplist/CR'),
      expect.objectContaining({
        headers: {
          'X-eBirdApiToken': 'ebird-key',
        },
      })
    );
  });

  it('builds eBird recent observation query', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse([eBirdObservation()]));
    const client = new EBirdClient({
      baseUrl: 'https://api.ebird.test/v2',
      apiKey: 'ebird-key',
      fetchImpl,
    });

    await client.getRecentObservations('CR', 'brnjay');

    expect(fetchImpl.mock.calls[0][0].toString())
      .toBe('https://api.ebird.test/v2/data/obs/CR/recent/brnjay?hotspot=true');
  });

  it('searches iNaturalist taxa by name', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(iNaturalistPayload()));
    const client = new INaturalistClient({
      baseUrl: 'https://api.inaturalist.test/v1',
      fetchImpl,
    });

    await expect(client.searchTaxaByName('Resplendent Quetzal')).resolves.toEqual(iNaturalistPayload());

    expect(fetchImpl.mock.calls[0][0].toString())
      .toBe('https://api.inaturalist.test/v1/taxa?q=Resplendent+Quetzal');
  });

  it('fetches one Xeno-canto page with the API key query parameter', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(xenoCantoPayload()));
    const client = new XenoCantoClient({
      baseUrl: 'https://xeno-canto.test/api/2/recordings',
      apiKey: 'xc-key',
      fetchImpl,
    });

    await expect(client.getCostaRicaBirdSongs({
      paginate: false,
    })).resolves.toEqual(xenoCantoPayload());

    const url = fetchImpl.mock.calls[0][0];
    expect(url.searchParams.get('query')).toBe(COSTA_RICA_BIRD_SONG_QUERY);
    expect(url.searchParams.get('key')).toBe('xc-key');
    expect(url.searchParams.get('per_page')).toBe('500');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('fetches wiki page summaries through the external rate limiter', async () => {
    const rateLimiter = {
      acquire: jest.fn().mockResolvedValue(),
    };
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      extract: 'The resplendent quetzal is a bird in the trogon family.',
    }));
    const client = new WikiClient({
      baseUrl: 'https://wiki.test/api/rest_v1',
      fetchImpl,
      rateLimiter,
      adminEmail: 'admin@example.test',
    });

    await expect(client.getPageSummary('Resplendent quetzal')).resolves.toEqual({
      extract: 'The resplendent quetzal is a bird in the trogon family.',
    });

    expect(rateLimiter.acquire).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://wiki.test/api/rest_v1/page/summary/Resplendent%20quetzal'),
      expect.objectContaining({
        headers: {
          'User-Agent': 'BirdwatchingAI/1.0 (admin@example.test)',
        },
      })
    );
    expect(fetchImpl.mock.calls[0][0].toString())
      .toBe('https://wiki.test/api/rest_v1/page/summary/Resplendent%20quetzal');
  });

  it('uses a dedicated 500ms wiki rate limit by default', () => {
    const client = new WikiClient({
      baseUrl: 'https://wiki.test/api/rest_v1',
      fetchImpl: jest.fn(),
    });

    expect(WIKI_RATE_LIMIT_MAX_REQUESTS).toBe(1);
    expect(WIKI_RATE_LIMIT_WINDOW_MS).toBe(500);
    expect(client.httpClient.rateLimiter.maxRequests).toBe(1);
    expect(client.httpClient.rateLimiter.windowMs).toBe(500);
  });

  it('fetches all Xeno-canto pages and combines recordings by default', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse(xenoCantoPayload({
        numRecordings: '2',
        page: 1,
        numPages: 2,
        recordings: [{ id: 'first' }],
      })))
      .mockResolvedValueOnce(jsonResponse(xenoCantoPayload({
        numRecordings: '2',
        page: 2,
        numPages: 2,
        recordings: [{ id: 'second' }],
      })));
    const client = new XenoCantoClient({
      baseUrl: 'https://xeno-canto.test/api/2/recordings',
      apiKey: 'xc-key',
      fetchImpl,
    });

    await expect(client.getCostaRicaBirdSongs()).resolves.toEqual({
      numRecordings: '2',
      numSpecies: '1',
      page: 1,
      numPages: 2,
      recordings: [
        { id: 'first' },
        { id: 'second' },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0].searchParams.get('page')).toBe('1');
    expect(fetchImpl.mock.calls[1][0].searchParams.get('page')).toBe('2');
  });

  it('validates documented provider response shapes', () => {
    expect(isXenoCantoResponse(xenoCantoPayload())).toBe(true);
    expect(isXenoCantoResponse({ recordings: [] })).toBe(false);

    expect(isTaxaSearchResponse(iNaturalistPayload())).toBe(true);
    expect(isTaxaSearchResponse({ results: [] })).toBe(false);

    expect(isSpeciesListResponse(['higtin1', 'gretin1'])).toBe(true);
    expect(isSpeciesListResponse(['higtin1', 12])).toBe(false);

    expect(isRecentObservationsResponse([eBirdObservation()])).toBe(true);
    expect(isRecentObservationsResponse([eBirdObservation({ lat: '10.4' })])).toBe(false);
  });

  it('normalizes non-2xx and unexpected response shape failures', async () => {
    const failedFetch = jest.fn().mockResolvedValue(jsonResponse({
      error: 'nope',
    }, {
      ok: false,
      status: 503,
    }));
    const malformedFetch = jest.fn().mockResolvedValue(jsonResponse({
      results: [],
    }));

    const failedClient = new ExternalHttpClient({
      baseUrl: 'https://provider.test',
      provider: 'Provider',
      fetchImpl: failedFetch,
    });
    const malformedClient = new ExternalHttpClient({
      baseUrl: 'https://provider.test',
      provider: 'Provider',
      fetchImpl: malformedFetch,
    });

    await expect(failedClient.get('/birds')).rejects.toMatchObject({
      status: 503,
      code: 'EXTERNAL_API_REQUEST_FAILED',
    });
    await expect(malformedClient.get('/birds', {
      validate: Array.isArray,
    })).rejects.toMatchObject({
      status: 502,
      code: 'EXTERNAL_API_UNEXPECTED_RESPONSE',
    });
  });

  it('paces requests through the shared external API rate limit window', async () => {
    let currentTime = 0;
    const waits = [];
    const limiter = new ExternalApiRateLimiter({
      maxRequests: 2,
      windowMs: 1000,
      now: () => currentTime,
      sleep: async (delayMs) => {
        waits.push(delayMs);
        currentTime += delayMs;
      },
    });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(waits).toEqual([500, 500]);
  });
});
