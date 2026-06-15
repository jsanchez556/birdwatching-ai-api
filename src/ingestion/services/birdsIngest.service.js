import { mkdir, readFile, stat } from 'fs/promises';
import path from 'path';
import EBirdClient from '../clients/ebird.client.js';
import INaturalistClient from '../clients/inaturalist.client.js';
import XenoCantoClient from '../clients/xenoCanto.client.js';
import logger from '../../utils/logger.js';
import { MediaAssetUploadService } from '../../services/mediaAsset.service.js';
import WikiClient from '../clients/wiki.client.js';
import ingestService from './ingest.service.js';
import { chunkArray } from '../../utils/array.utils.js';
import { toIsoDateOnly } from '../../utils/date.utils.js';
import {
  buildJsonFileName,
  isFileFresh,
  isIsoDateFresh,
  readJsonFile,
  readJsonFileOrDefault,
  writeJsonFile,
} from '../../utils/fs.utils.js';
import {
  DEFAULT_XENO_CANTO_AUDIO_EXTENSION,
  EBIRD_TAXONOMY_CHUNK_SIZE,
  INATURALIST_PROVIDER,
  XENO_CANTO_PROVIDER,
  XENO_CANTO_RESOURCE,
  buildImagePayload,
  buildBirdDocument,
  buildBirdDocuments,
  buildMedia,
  buildINaturalistImageAssetKey,
  buildXenoCantoAudioAssetName,
  buildXenoCantoSonogramAssetName,
  documentsBySpeciesCode,
  enrichINaturalistPhotoExtract,
  extensionFromXenoCantoAudio,
  findMatchingINaturalistPhoto,
  findMatchingINaturalistTaxon,
  getDocumentDescription,
  getDocumentSpeciesCode,
  hasDescription,
  imageEntriesBySpeciesCode,
  mergeRecentObservationSummaries,
  normalizeCoordinate,
  normalizeINaturalistPhotoForExport,
  normalizeINaturalistPhotoPath,
  normalizeLastObservation,
  normalizeRecordingsByName,
  normalizeRecentObservations,
  normalizeSong,
  normalizeTaxonomyEntries,
  normalizeWikipediaTitle,
  normalizeXenoCantoObservation,
  normalizeXenoCantoRecordingForExport,
  normalizeXenoCantoSourceUrl,
  readExistingXenoCantoExport,
  recordingEntries,
  selectLatestObservation,
  summarizeRecentObservations,
  toBirdProfileDocument,
  taxonomyEntriesBySpeciesCode,
  uniqueSpeciesRecordingEntries,
  xenoCantoExportResult,
} from '../utils/birdsIngest.utils.js';
import {
  COSTA_RICA_COUNTRY_CODE,
  DAY_MS,
  MONTH_MS,
  SIX_MONTHS_MS,
  WEEK_MS,
  YEAR_MS,
} from '../../utils/constants.utils.js';

const EXTERNAL_PROVIDERS = {
  ebird: 'ebird',
  inaturalist: 'inaturalist',
  xenocanto: 'xenocanto',
};

const BIRD_SOURCE_FILES = {
  speciesList: 'ebird-species-list-cr.json',
  taxonomy: 'ebird-species-taxo-cr.json',
  observations: 'ebird-recent-observations-cr.json',
  images: 'inaturalist-costa-rica-bird-images.json',
  songs: 'xenocanto-costa-rica-bird-songs.json',
};

const SUPPORTED_EXTENSIONS = new Set(['.json']);
const RECOVERABLE_EXTERNAL_API_ERROR_CODES = new Set([
  'EXTERNAL_API_MALFORMED_RESPONSE',
  'EXTERNAL_API_REQUEST_FAILED',
  'EXTERNAL_API_UNEXPECTED_RESPONSE',
]);

function isRecoverableExternalApiError(error) {
  if (!RECOVERABLE_EXTERNAL_API_ERROR_CODES.has(error?.code)) {
    return false;
  }

  return error.code !== 'EXTERNAL_API_REQUEST_FAILED'
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

function dataPath(fileName, dataDir) {
  return path.join(dataDir, fileName);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function shouldRefresh(filePath, maxAgeMs, options = {}) {
  return !(await isFileFresh(filePath, maxAgeMs, options));
}

async function assertFilesExist(fileNames, dataDir) {
  const missing = [];

  for (const fileName of fileNames) {
    if (!(await fileExists(dataPath(fileName, dataDir)))) {
      missing.push(fileName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required enrichment source file(s): ${missing.join(', ')}`);
  }
}

async function readBirdSourceData(options = {}) {
  const dataDir = options.externalDataDir || options.dataDir;

  const [taxonomy, images, observations, songs] = await Promise.all([
    readJsonFile(path.join(dataDir, BIRD_SOURCE_FILES.taxonomy)),
    readJsonFile(path.join(dataDir, BIRD_SOURCE_FILES.images)),
    readJsonFile(path.join(dataDir, BIRD_SOURCE_FILES.observations)),
    readJsonFile(path.join(dataDir, BIRD_SOURCE_FILES.songs)),
  ]);

  return {
    taxonomy,
    images,
    observations,
    songs,
  };
}

function resolveBirdOutputPath(options = {}) {
  const outputDir = options.outputDir || options.dataDir;

  return options.outputPath || path.join(outputDir, 'birds.json');
}

async function writeBirdDocuments(documents, options = {}) {
  const outputPath = resolveBirdOutputPath(options);

  await writeJsonFile(outputPath, documents);

  return outputPath;
}

async function readExistingBirdDocuments(options = {}) {
  const outputPath = resolveBirdOutputPath(options);
  const documents = await readJsonFileOrDefault(outputPath, []);

  return Array.isArray(documents) ? documents : [];
}

function orderDocumentsByTaxonomy(documentsByCode, taxonomy = {}) {
  return Object.keys(taxonomy)
    .map((speciesCode) => documentsByCode.get(speciesCode))
    .filter(Boolean);
}

async function generateBirdIngestData(options = {}) {
  const sourceData = options.sourceData || await readBirdSourceData(options);
  const existingDocuments = options.existingDocuments || await readExistingBirdDocuments(options);
  const incrementalDocumentsByCode = documentsBySpeciesCode(existingDocuments);
  const writeIncrementally = options.writeIncrementally ?? true;
  let reusedDescriptionCount = 0;
  let fetchedDescriptionCount = 0;

  const documents = await buildBirdDocuments(sourceData, {
    ...options,
    existingDocuments,
    onDocument: async (document, builtDocuments) => {
      const speciesCode = getDocumentSpeciesCode(document);
      const previousDocument = incrementalDocumentsByCode.get(speciesCode);

      if (hasDescription(previousDocument) && getDocumentDescription(previousDocument) === getDocumentDescription(document)) {
        reusedDescriptionCount += 1;
      } else if (hasDescription(document)) {
        fetchedDescriptionCount += 1;
      }

      if (!writeIncrementally) {
        return;
      }

      incrementalDocumentsByCode.set(speciesCode, document);
      await writeBirdDocuments(
        orderDocumentsByTaxonomy(incrementalDocumentsByCode, sourceData.taxonomy),
        options
      );

      logger.info('Bird ingest data progress saved', {
        processedCount: builtDocuments.length,
        totalCount: Object.keys(sourceData.taxonomy || {}).length,
        speciesCode,
      });
    },
  });
  const outputPath = await writeBirdDocuments(documents, options);

  return {
    dataset: 'birds',
    outputPath,
    count: documents.length,
    fetchedDescriptionCount,
    reusedDescriptionCount,
  };
}

function normalizeFileName(fileName) {
  const extension = path.extname(fileName);

  return extension ? fileName : `${fileName}.json`;
}

function assertSafeDataPath(fileName, dataDir) {
  const normalizedFileName = normalizeFileName(fileName);
  const filePath = path.resolve(dataDir, normalizedFileName);
  const relativePath = path.relative(dataDir, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to read outside src/ai/enrichment/data: ${fileName}`);
  }

  return filePath;
}

function parseJson(rawContent, fileName = 'dataset.json') {
  const parsed = JSON.parse(rawContent);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  throw new Error(`Invalid ingestion dataset shape in ${fileName}: expected a JSON array of normalized documents`);
}

async function readDocumentsFromFile(fileName, options = {}) {
  const filePath = assertSafeDataPath(fileName, options.dataDir);
  const resolvedFileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      fileName: resolvedFileName,
      skipped: true,
      reason: `Unsupported file type: ${extension || 'unknown'}`,
      documents: [],
    };
  }

  const rawContent = await readFile(filePath, 'utf8');
  const documents = parseJson(rawContent, resolvedFileName);

  return {
    fileName: resolvedFileName,
    skipped: false,
    documents,
  };
}

async function ingestFiles(fileNames, options = {}) {
  const results = [];

  for (const fileName of fileNames) {
    try {
      const parsed = await readDocumentsFromFile(fileName, options);

      if (parsed.skipped) {
        logger.warn('Skipping unsupported ingestion file', {
          fileName,
          reason: parsed.reason,
        });
        results.push({
          fileName,
          skipped: true,
          reason: parsed.reason,
        });
        continue;
      }

      const summary = await ingestService.ingestDocuments(parsed.documents, {
        force: options.force ?? false,
        source: parsed.fileName,
      });

      logger.info('Ingestion file processed', {
        fileName: parsed.fileName,
        ...summary,
      });

      results.push({
        fileName: parsed.fileName,
        skipped: false,
        ...summary,
      });
    } catch (error) {
      logger.error('Ingestion file failed', {
        fileName,
        error: error.message,
      });
      results.push({
        fileName,
        failed: true,
        error: error.message,
      });
    }
  }

  const failed = results.filter((result) => result.failed);

  if (failed.length > 0) {
    const fileList = failed.map((result) => result.fileName).join(', ');
    throw new Error(`Failed to ingest ${failed.length} file(s): ${fileList}`);
  }

  return results;
}

class BirdsExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    const clientOptions = options.rateLimiter
      ? { rateLimiter: options.rateLimiter }
      : {};

    this.eBirdClient = options.eBirdClient || new EBirdClient(clientOptions);
    this.iNaturalistClient = options.iNaturalistClient || new INaturalistClient(clientOptions);
    this.xenoCantoClient = options.xenoCantoClient || new XenoCantoClient(clientOptions);
    this.wikiClient = options.wikiClient || new WikiClient();
    this.mediaAssetService = options.mediaAssetService;
    this.wikiService = options.wikiService;
    this.now = options.now || (() => Date.now());
  }

  createExternalJobs(options = {}) {
    const dataDir = options.dataDir || this.dataDir;
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const perPage = options.perPage ?? 500;
    const now = typeof options.now === 'function' ? options.now() : options.now || this.now();
    const speciesListPath = dataPath(BIRD_SOURCE_FILES.speciesList, dataDir);
    const taxonomyPath = dataPath(BIRD_SOURCE_FILES.taxonomy, dataDir);
    const observationsPath = dataPath(BIRD_SOURCE_FILES.observations, dataDir);
    const imagesPath = dataPath(BIRD_SOURCE_FILES.images, dataDir);
    const songsPath = dataPath(BIRD_SOURCE_FILES.songs, dataDir);

    return [
      {
        name: 'ebird-species-list',
        fileName: BIRD_SOURCE_FILES.speciesList,
        filePath: speciesListPath,
        maxAgeMs: MONTH_MS,
        run: () => this.exportSpeciesList({
          countryCode,
          filePath: speciesListPath,
          force: true,
        }),
      },
      {
        name: 'ebird-species-taxonomy',
        fileName: BIRD_SOURCE_FILES.taxonomy,
        filePath: taxonomyPath,
        maxAgeMs: SIX_MONTHS_MS,
        run: () => this.exportTaxonomy({
          countryCode,
          speciesFilePath: speciesListPath,
          filePath: taxonomyPath,
          force: true,
        }),
      },
      {
        name: 'ebird-recent-observations',
        fileName: BIRD_SOURCE_FILES.observations,
        filePath: observationsPath,
        maxAgeMs: WEEK_MS,
        run: () => this.exportRecentObservations({
          countryCode,
          speciesFilePath: speciesListPath,
          filePath: observationsPath,
          force: true,
        }),
      },
      {
        name: 'inaturalist-bird-images',
        fileName: BIRD_SOURCE_FILES.images,
        filePath: imagesPath,
        maxAgeMs: MONTH_MS,
        run: () => this.exportCostaRicaBirdImages({
          countryCode,
          taxonomyFilePath: taxonomyPath,
          filePath: imagesPath,
          force: true,
        }),
      },
      {
        name: 'xenocanto-bird-songs',
        fileName: BIRD_SOURCE_FILES.songs,
        filePath: songsPath,
        maxAgeMs: SIX_MONTHS_MS,
        run: () => this.exportCostaRicaBirdSongs({
          filePath: songsPath,
          force: true,
          perPage,
        }),
      },
    ].map((job) => ({
      ...job,
      now,
    }));
  }

  async runExternalJob(job, options = {}) {
    const refresh = options.force || await shouldRefresh(job.filePath, job.maxAgeMs, { now: job.now });

    if (!refresh) {
      return {
        job: job.name,
        fileName: job.fileName,
        filePath: job.filePath,
        skipped: true,
        reason: 'fresh',
      };
    }

    const result = await job.run();

    return {
      job: job.name,
      fileName: job.fileName,
      ...result,
    };
  }

  async runExternalJobs(jobs, options = {}) {
    const results = [];

    for (const job of jobs) {
      logger.info('Starting enrichment external data job', {
        job: job.name,
        fileName: job.fileName,
        force: options.force,
      });

      const result = await this.runExternalJob(job, options);
      results.push(result);

      logger.info('Enrichment external data job completed', result);
    }

    return results;
  }

  async generateBirdIngestData(options = {}) {
    return generateBirdIngestData({
      dataDir: this.dataDir,
      externalDataDir: this.dataDir,
      outputDir: this.dataDir,
      ...options,
    });
  }

  async ingestFiles(fileNames, options = {}) {
    return ingestFiles(fileNames, {
      dataDir: this.dataDir,
      ...options,
    });
  }

  async enrichBirds(options = {}) {
    const dataDir = options.dataDir || this.dataDir;
    const externalJobs = this.createExternalJobs({
      ...options,
      dataDir,
    });
    const externalResults = await this.runExternalJobs(externalJobs, {
      force: options.force,
    });

    await assertFilesExist(Object.values(BIRD_SOURCE_FILES), dataDir);

    logger.info('Starting enrichment document generation', {
      target: 'birds',
    });

    const generationResult = await this.generateBirdIngestData({
      externalDataDir: dataDir,
      outputDir: dataDir,
      forceDescriptions: options.forceDescriptions,
    });

    logger.info('Enrichment document generation completed', generationResult);
    logger.info('Starting enrichment document ingestion', {
      target: 'birds',
      fileName: 'birds.json',
    });

    const ingestionResults = await this.ingestFiles(['birds.json'], {
      dataDir,
      force: options.force,
    });

    logger.info('Enrichment document ingestion completed', {
      target: 'birds',
      results: ingestionResults,
    });

    return {
      target: 'birds',
      externalResults,
      generationResult,
      ingestionResults,
    };
  }

  async exportEBird(options = {}) {
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

  async exportEBirdSpeciesList(options = {}) {
    return this.exportSpeciesList(options);
  }

  async exportEBirdTaxonomy(options = {}) {
    return this.exportTaxonomy(options);
  }

  async exportEBirdRecentObservations(options = {}) {
    return this.exportRecentObservations(options);
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
    const failedSpeciesCodes = [];

    for (const speciesCode of speciesCodes) {
      let observations;

      try {
        observations = await this.eBirdClient.getRecentObservations(countryCode, speciesCode, {
          signal: options.signal,
        });
      } catch (error) {
        console.error('Failed to fetch eBird recent observations for one species*********', {
          speciesCode,
          code: error.code,
          status: error.status,
          message: error.message,
        });
        if (!isRecoverableExternalApiError(error)) {
          throw error;
        }

        failedSpeciesCodes.push(speciesCode);
        logger.warn('Skipping eBird recent observations for one species after recoverable provider error', {
          event: 'ebird_recent_observations_species_skipped',
          code: error.code,
          status: error.status,
          failedCount: failedSpeciesCodes.length,
        });
        continue;
      }

      const freshPayload = summarizeRecentObservations(observations, speciesCode);

      payload = mergeRecentObservationSummaries(payload, freshPayload);
      fetchedCount += 1;

      await writeJsonFile(filePath, payload);
    }

    if (failedSpeciesCodes.length === speciesCodes.length && speciesCodes.length > 0) {
      throw new Error('Unable to refresh eBird recent observations for any species');
    }

    return {
      provider: EXTERNAL_PROVIDERS.ebird,
      resource: 'recent-observations',
      filePath,
      skipped: false,
      count: Object.keys(payload).length,
      fetchedCount,
      failedCount: failedSpeciesCodes.length,
      failedSpeciesCodes,
    };
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

  getMediaAssetService() {
    if (!this.mediaAssetService) {
      this.mediaAssetService = new MediaAssetUploadService();
    }

    return this.mediaAssetService;
  }

  getWikiService() {
    if (!this.wikiService) {
      this.wikiService = this;
    }

    return this.wikiService;
  }

  async exportINaturalist(options = {}) {
    await mkdir(this.dataDir, { recursive: true });

    return this.exportCostaRicaBirdImages(options);
  }

  async exportINaturalistCostaRicaBirdImages(options = {}) {
    return this.exportCostaRicaBirdImages(options);
  }

  async exportCostaRicaBirdImages(options = {}) {
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const taxonomyFilePath = options.taxonomyFilePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'taxo', countryCode)
    );
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('inaturalist', 'costa', 'rica', 'bird', 'images')
    );
    const taxonomyBySpeciesCode = await readJsonFileOrDefault(taxonomyFilePath, {});
    const taxonomyEntries = taxonomyEntriesBySpeciesCode(taxonomyBySpeciesCode);
    const existingPayload = await readJsonFileOrDefault(filePath, {});
    const updates = {
      ...(existingPayload.updates || {}),
    };
    const photosBySpeciesCode = imageEntriesBySpeciesCode(existingPayload);
    const today = toIsoDateOnly(this.now());
    let fetchedCount = 0;
    let skippedCount = 0;

    for (const taxonomyEntry of taxonomyEntries) {
      const existingPhoto = photosBySpeciesCode.get(taxonomyEntry.speciesCode);
      const lastUpdate = updates[taxonomyEntry.speciesCode] || existingPhoto?.['lastUpdate'];

      if (
        !options.force
        && isIsoDateFresh(lastUpdate, YEAR_MS, { now: this.now() })
      ) {
        const normalizedExistingPhoto = await normalizeINaturalistPhotoForExport(existingPhoto, {
          existingPhoto,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        if (normalizedExistingPhoto) {
          photosBySpeciesCode.set(
            taxonomyEntry.speciesCode,
            await enrichINaturalistPhotoExtract(normalizedExistingPhoto, {
              wikiService: this.getWikiService(),
              signal: options.signal,
            })
          );
        }

        skippedCount += 1;
        continue;
      }

      const response = await this.iNaturalistClient.searchTaxaByName(taxonomyEntry.comName, {
        signal: options.signal,
      });
      const photo = findMatchingINaturalistPhoto(response, taxonomyEntry.comName);
      updates[taxonomyEntry.speciesCode] = today;
      fetchedCount += 1;

      if (photo) {
        const match = findMatchingINaturalistTaxon(response, taxonomyEntry.comName);
        const photoEntry = await normalizeINaturalistPhotoForExport({
          speciesCode: taxonomyEntry.speciesCode,
          ...photo,
          'lastUpdate': today,
        }, {
          existingPhoto,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        const wikiTitle = normalizeWikipediaTitle(match?.wikipedia_url);

        if (photoEntry && wikiTitle) {
          photoEntry.wikiTitle = wikiTitle;
        }

        if (photoEntry) {
          photosBySpeciesCode.set(
            taxonomyEntry.speciesCode,
            await enrichINaturalistPhotoExtract(photoEntry, {
              wikiService: this.getWikiService(),
              signal: options.signal,
            })
          );
        } else {
          photosBySpeciesCode.delete(taxonomyEntry.speciesCode);
        }
      } else {
        photosBySpeciesCode.delete(taxonomyEntry.speciesCode);
      }

      await writeJsonFile(filePath, buildImagePayload(taxonomyEntries, photosBySpeciesCode));
    }

    const payload = buildImagePayload(taxonomyEntries, photosBySpeciesCode);

    await writeJsonFile(filePath, payload);

    return {
      provider: INATURALIST_PROVIDER,
      resource: 'costa-rica-bird-images',
      filePath,
      skipped: false,
      count: Object.keys(payload).length,
      fetchedCount,
      skippedCount,
    };
  }

  async exportXenoCanto(options = {}) {
    await mkdir(this.dataDir, { recursive: true });

    return this.exportCostaRicaBirdSongs(options);
  }

  async exportXenoCantoCostaRicaBirdSongs(options = {}) {
    return this.exportCostaRicaBirdSongs(options);
  }

  async exportCostaRicaBirdSongs(options = {}) {
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('xenocanto', 'costa', 'rica', 'bird', 'songs')
    );

    if (!options.force && await isFileFresh(filePath, DAY_MS * 8, { now: this.now() })) {
      const existingPayload = await readJsonFile(filePath);

      if (
        !Array.isArray(existingPayload)
        && existingPayload
        && !Array.isArray(existingPayload.recordings)
      ) {
        const recordings = await normalizeRecordingsByName(Object.entries(existingPayload || {}), {
          mediaAssetService: this.mediaAssetService,
          signal: options.signal,
        });

        if (JSON.stringify(recordings) !== JSON.stringify(existingPayload)) {
          await writeJsonFile(filePath, recordings);

          return xenoCantoExportResult(filePath, {
            skipped: false,
            reason: 'migrated',
            count: Object.keys(recordings).length,
          });
        }

        return xenoCantoExportResult(filePath, {
          skipped: true,
          reason: 'fresh',
        });
      }

      if (Array.isArray(existingPayload)) {
        const recordings = await normalizeRecordingsByName(recordingEntries(existingPayload), {
          filePath,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        return xenoCantoExportResult(filePath, {
          skipped: false,
          reason: 'migrated',
          count: Object.keys(recordings).length,
        });
      }

      if (Array.isArray(existingPayload?.recordings)) {
        const recordings = await normalizeRecordingsByName(
          recordingEntries(existingPayload.recordings),
          {
            mediaAssetService: this.getMediaAssetService(),
            filePath,
            signal: options.signal,
          }
        );

        return xenoCantoExportResult(filePath, {
          skipped: false,
          reason: 'migrated',
          count: Object.keys(recordings).length,
        });
      }
    }

    const existingRecordingsByName = await readExistingXenoCantoExport(filePath);
    const payload = await this.xenoCantoClient.getCostaRicaBirdSongs({
      perPage: options.perPage ?? 500,
      signal: options.signal,
    });
    const recordings = await normalizeRecordingsByName(
      uniqueSpeciesRecordingEntries(payload.recordings),
      {
        existingRecordingsByName,
        filePath,
        mediaAssetService: this.getMediaAssetService(),
        signal: options.signal,
      }
    );

    return xenoCantoExportResult(filePath, {
      skipped: false,
      count: Object.keys(recordings).length,
      pageCount: payload.numPages,
    });
  }
}
export {
  assertSafeDataPath,
  generateBirdIngestData,
  ingestFiles,
  normalizeFileName,
  parseJson,
  readDocumentsFromFile,
};

export default BirdsExportService;
