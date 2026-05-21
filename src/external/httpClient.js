import HttpError from '../utils/httpError.js';

function assertConfigValue(value, key) {
  if (!value) {
    throw new HttpError(500, `Missing required environment variable: ${key}`, {
      code: 'EXTERNAL_API_CONFIG_ERROR',
      details: { key },
    });
  }
}

function parseJsonResponse(rawText, provider) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new HttpError(502, `${provider} returned malformed JSON`, {
      code: 'EXTERNAL_API_MALFORMED_RESPONSE',
      details: { provider },
    });
  }
}

class ExternalHttpClient {
  constructor(options = {}) {
    assertConfigValue(options.baseUrl, options.baseUrlEnvName || 'EXTERNAL_API_BASE_URL');

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.provider = options.provider || 'External API';
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.rateLimiter = options.rateLimiter;

    if (!this.fetchImpl) {
      throw new HttpError(500, 'Fetch is not available in this Node.js runtime', {
        code: 'EXTERNAL_API_FETCH_UNAVAILABLE',
      });
    }
  }

  buildUrl(path = '', query = {}) {
    const pathname = path
      ? `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
      : this.baseUrl;
    const url = new URL(pathname);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }

    return url;
  }

  async get(path, options = {}) {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    const url = this.buildUrl(path, options.query);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: options.headers,
      signal: options.signal,
    });
    const payload = parseJsonResponse(await response.text(), this.provider);

    if (!response.ok) {
      throw new HttpError(response.status, `${this.provider} request failed`, {
        code: 'EXTERNAL_API_REQUEST_FAILED',
        details: {
          provider: this.provider,
          status: response.status,
        },
      });
    }

    if (options.validate && !options.validate(payload)) {
      throw new HttpError(502, `${this.provider} returned an unexpected response shape`, {
        code: 'EXTERNAL_API_UNEXPECTED_RESPONSE',
        details: { provider: this.provider },
      });
    }

    return payload;
  }
}

export {
  assertConfigValue,
};
export default ExternalHttpClient;
