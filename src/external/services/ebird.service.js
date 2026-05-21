import { mkdir } from 'fs/promises';
import path from 'path';
import {
  EBIRD_TAXONOMY_CHUNK_SIZE,
  mergeRecentObservationSummaries,
  normalizeTaxonomyEntries,
  summarizeRecentObservations,
} from '../utils/ebird.utils.js';
import {
  COSTA_RICA_COUNTRY_CODE,
  EXTERNAL_PROVIDERS,
  YEAR_MS,
  buildJsonFileName,
  chunkArray,
  isFileFresh,
  readJsonFile,
  readJsonFileOrDefault,
  writeJsonFile,
} from '../utils/export.utils.js';

class EBirdExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.eBirdClient = options.eBirdClient;
    this.now = options.now || (() => Date.now());
  }

  async export(options = {}) {
    await mkdir(this.dataDir, { recursive: true });

    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const speciesFilePath = path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'list', countryCode)
    );
    const observationsFilePath = path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'recent', 'observations', countryCode)
    );
    const taxonomyFilePath = path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'taxo', countryCode)
    );

    const speciesResult = await this.exportSpeciesList({
      countryCode,
      filePath: speciesFilePath,
      force: options.force,
      signal: options.signal,
    });
    const taxonomyResult = await this.exportTaxonomy({
      countryCode,
      speciesFilePath,
      filePath: taxonomyFilePath,
      signal: options.signal,
    });
    const observationsResult = await this.exportRecentObservations({
      countryCode,
      filePath: observationsFilePath,
      signal: options.signal,
    });

    return [speciesResult, taxonomyResult, observationsResult];
  }

  async exportSpeciesList(options = {}) {
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'list', countryCode)
    );

    if (!options.force && await isFileFresh(filePath, YEAR_MS, { now: this.now() })) {
      return {
        provider: EXTERNAL_PROVIDERS.ebird,
        resource: 'species-list',
        filePath,
        skipped: true,
        reason: 'fresh',
      };
    }

    const payload = await this.eBirdClient.getSpeciesList(countryCode, {
      signal: options.signal,
    });
    await writeJsonFile(filePath, payload);

    return {
      provider: EXTERNAL_PROVIDERS.ebird,
      resource: 'species-list',
      filePath,
      skipped: false,
      count: payload.length,
    };
  }

  async exportTaxonomy(options = {}) {
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const speciesFilePath = options.speciesFilePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'list', countryCode)
    );
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'taxo', countryCode)
    );
    const speciesCodes = await readJsonFile(speciesFilePath);
    const existingPayload = await readJsonFileOrDefault(filePath, {});
    const missingSpeciesCodes = speciesCodes.filter((speciesCode) => (
      !existingPayload[speciesCode]
    ));
    const chunks = chunkArray(missingSpeciesCodes, EBIRD_TAXONOMY_CHUNK_SIZE);
    const taxonomyBySpeciesCode = {
      ...existingPayload,
    };
    let fetchedCount = 0;

    for (const chunk of chunks) {
      const response = await this.eBirdClient.getTaxo(chunk.join(','), {
        signal: options.signal,
      });
      const normalizedResponse = normalizeTaxonomyEntries(response);
      Object.assign(taxonomyBySpeciesCode, normalizedResponse);
      fetchedCount += Object.keys(normalizedResponse).length;
    }

    await writeJsonFile(filePath, taxonomyBySpeciesCode);

    return {
      provider: EXTERNAL_PROVIDERS.ebird,
      resource: 'species-taxo',
      filePath,
      skipped: chunks.length === 0,
      count: Object.keys(taxonomyBySpeciesCode).length,
      fetchedCount,
      skippedCount: speciesCodes.length - missingSpeciesCodes.length,
    };
  }

  async exportRecentObservations(options = {}) {
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'recent', 'observations', countryCode)
    );
    const speciesFilePath = options.speciesFilePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'list', countryCode)
    );

    const speciesCodes = await readJsonFile(speciesFilePath);
    const existingPayload = await readJsonFileOrDefault(filePath, {});
    let payload = mergeRecentObservationSummaries(existingPayload, {});
    let fetchedCount = 0;

    for (const speciesCode of speciesCodes) {
      const observations = await this.eBirdClient.getRecentObservations(countryCode, speciesCode, {
        signal: options.signal,
      });
      const freshPayload = summarizeRecentObservations(observations, speciesCode);

      payload = mergeRecentObservationSummaries(payload, freshPayload);
      fetchedCount += 1;

      await writeJsonFile(filePath, payload);
    }

    return {
      provider: EXTERNAL_PROVIDERS.ebird,
      resource: 'recent-observations',
      filePath,
      skipped: false,
      count: Object.keys(payload).length,
      fetchedCount,
    };
  }
}

export {
  EBIRD_TAXONOMY_CHUNK_SIZE,
  EBirdExportService,
};
export default EBirdExportService;
