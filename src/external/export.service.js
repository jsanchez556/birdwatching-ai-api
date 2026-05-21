import EBirdClient from './clients/ebird.client.js';
import INaturalistClient from './clients/inaturalist.client.js';
import XenoCantoClient from './clients/xenoCanto.client.js';
import {
  DAY_MS,
  COSTA_RICA_COUNTRY_CODE,
  EXTERNAL_DATA_DIR,
  EXTERNAL_PROVIDERS,
  EXTERNAL_RESOURCES,
  YEAR_MS,
  buildJsonFileName,
  chunkArray,
  isFileFresh,
  isIsoDateFresh,
  readJsonFile,
  readJsonFileOrDefault,
  toIsoDateOnly,
  writeJsonFile,
} from './utils/export.utils.js';
import EBirdExportService, {
  EBIRD_TAXONOMY_CHUNK_SIZE,
} from './services/ebird.service.js';
import {
  areLocationsSimilar,
  mergeRecentObservationSummaries,
  normalizeTaxonomyEntries,
  summarizeRecentObservations,
} from './utils/ebird.utils.js';
import INaturalistExportService, {
  findMatchingINaturalistPhoto,
  findMatchingINaturalistTaxon,
} from './services/inaturalist.service.js';
import XenoCantoExportService, {
  normalizeXenoCantoRecordingForExport,
} from './services/xenoCanto.service.js';

class ExternalDataExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir || EXTERNAL_DATA_DIR;
    this.now = options.now || (() => Date.now());
    const clientOptions = options.rateLimiter
      ? { rateLimiter: options.rateLimiter }
      : {};

    this.eBirdClient = options.eBirdClient || new EBirdClient(clientOptions);
    this.iNaturalistClient = options.iNaturalistClient || new INaturalistClient(clientOptions);
    this.xenoCantoClient = options.xenoCantoClient || new XenoCantoClient(clientOptions);
    this.mediaAssetService = options.mediaAssetService;
    this.wikiService = options.wikiService;

    this.eBirdExportService = options.eBirdExportService || new EBirdExportService({
      dataDir: this.dataDir,
      eBirdClient: this.eBirdClient,
      now: this.now,
    });
    this.iNaturalistExportService = options.iNaturalistExportService
      || new INaturalistExportService({
        dataDir: this.dataDir,
        iNaturalistClient: this.iNaturalistClient,
        mediaAssetService: this.mediaAssetService,
        wikiService: this.wikiService,
        now: this.now,
      });
    this.xenoCantoExportService = options.xenoCantoExportService || new XenoCantoExportService({
      dataDir: this.dataDir,
      xenoCantoClient: this.xenoCantoClient,
      mediaAssetService: this.mediaAssetService,
      now: this.now,
    });
  }

  async exportEBird(options = {}) {
    return this.eBirdExportService.export(options);
  }

  async exportEBirdSpeciesList(options = {}) {
    return this.eBirdExportService.exportSpeciesList(options);
  }

  async exportEBirdTaxonomy(options = {}) {
    return this.eBirdExportService.exportTaxonomy(options);
  }

  async exportEBirdRecentObservations(options = {}) {
    return this.eBirdExportService.exportRecentObservations(options);
  }

  async exportXenoCanto(options = {}) {
    return this.xenoCantoExportService.export(options);
  }

  async exportXenoCantoCostaRicaBirdSongs(options = {}) {
    return this.xenoCantoExportService.exportCostaRicaBirdSongs(options);
  }

  async exportINaturalist(options = {}) {
    return this.iNaturalistExportService.export(options);
  }

  async exportINaturalistCostaRicaBirdImages(options = {}) {
    return this.iNaturalistExportService.exportCostaRicaBirdImages(options);
  }
}

export {
  DAY_MS,
  EBIRD_TAXONOMY_CHUNK_SIZE,
  COSTA_RICA_COUNTRY_CODE,
  EXTERNAL_DATA_DIR,
  EXTERNAL_PROVIDERS,
  EXTERNAL_RESOURCES,
  YEAR_MS,
  areLocationsSimilar,
  buildJsonFileName,
  chunkArray,
  findMatchingINaturalistPhoto,
  findMatchingINaturalistTaxon,
  isFileFresh,
  isIsoDateFresh,
  mergeRecentObservationSummaries,
  normalizeTaxonomyEntries,
  normalizeXenoCantoRecordingForExport,
  readJsonFile,
  readJsonFileOrDefault,
  summarizeRecentObservations,
  toIsoDateOnly,
  writeJsonFile,
};
export default ExternalDataExportService;
