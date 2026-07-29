import env from '../../config/env.js';
import HttpClient from '../../utils/httpClient.js';
import ApiRateLimiter from '../../utils/rateLimiter.js';

const WIKI_RATE_LIMIT_MAX_REQUESTS = 1;
const WIKI_RATE_LIMIT_WINDOW_MS = 500;

class WikiClient {
  constructor(options = {}) {
    const rateLimiter = options.rateLimiter || new ApiRateLimiter({
      maxRequests: WIKI_RATE_LIMIT_MAX_REQUESTS,
      windowMs: WIKI_RATE_LIMIT_WINDOW_MS,
    });

    this.adminEmail = options.adminEmail ?? env.adminEmail;
    this.httpClient = options.httpClient || new HttpClient({
      baseUrl: options.baseUrl ?? env.wikiApiBaseUrl,
      baseUrlEnvName: 'WIKI_API_BASE_URL',
      provider: 'wiki',
      fetchImpl: options.fetchImpl,
      rateLimiter,
    });
  }

  async getPageSummary(title, options = {}) {
    const trimmedTitle = String(title || '').trim();

    if (!trimmedTitle) {
      throw new Error('Wiki page title is required');
    }

    return this.httpClient.get(`/page/summary/${encodeURIComponent(trimmedTitle)}`, {
      headers: {
        'User-Agent': `BirdwatchingAI/1.0 (${this.adminEmail})`,
      },
      signal: options.signal,
    });
  }
}

export {
  WIKI_RATE_LIMIT_MAX_REQUESTS,
  WIKI_RATE_LIMIT_WINDOW_MS,
};
export default WikiClient;
