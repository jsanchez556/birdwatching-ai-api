import WikiClient from '../clients/wiki.client.js';

class WikiExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.wikiClient = options.wikiClient || new WikiClient();
    this.now = options.now || (() => Date.now());
  }

  async getBirdDescription(name, options = {}) {
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      throw new Error('Bird name is required');
    }

    const response = await this.wikiClient.getPageSummary(trimmedName, {
      signal: options.signal,
    });

    return response?.extract || response?.extract_html || '';
  }
}

export {
  WikiExportService,
};
export default WikiExportService;
