import { mkdir, readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import logger from '../src/utils/logger.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const EXTERNAL_DATA_DIR = path.join(PROJECT_ROOT, 'src/external/data');
const INGESTION_DATA_DIR = path.join(PROJECT_ROOT, 'src/db/ingestion/data');
const SUPPORTED_DATASETS = new Set(['birds']);

const SOURCE_FILES = {
  taxonomy: 'ebird-species-taxo-cr.json',
  images: 'inaturalist-costa-rica-bird-images.json',
  observations: 'ebird-recent-observations-cr.json',
  songs: 'xenocanto-costa-rica-bird-songs.json',
};

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args = []) {
  const forceDescriptions = args.includes('--force-descriptions');
  const dataset = args.find((arg) => !arg.startsWith('--'));

  if (!dataset) {
    throw new Error('Dataset is required. Usage: npm run generate-ingest -- birds');
  }

  const normalizedDataset = dataset.toLowerCase();

  if (!SUPPORTED_DATASETS.has(normalizedDataset)) {
    throw new Error(`Unsupported ingest dataset: ${dataset}. Supported datasets: birds`);
  }

  return {
    dataset: normalizedDataset,
    forceDescriptions,
  };
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonFileOrDefault(filePath, fallback) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function readBirdSourceData(options = {}) {
  const dataDir = options.externalDataDir || EXTERNAL_DATA_DIR;

  const [taxonomy, images, observations, songs] = await Promise.all([
    readJsonFile(path.join(dataDir, SOURCE_FILES.taxonomy)),
    readJsonFile(path.join(dataDir, SOURCE_FILES.images)),
    readJsonFile(path.join(dataDir, SOURCE_FILES.observations)),
    readJsonFile(path.join(dataDir, SOURCE_FILES.songs)),
  ]);

  return {
    taxonomy,
    images,
    observations,
    songs,
  };
}

function normalizeDescription(value) {
  const description = String(value || '').trim();

  return description || null;
}

function parseObservationTime(observation) {
  const value = String(observation?.obsDt || '').trim();

  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value.replace(' ', 'T'));

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const coordinate = Number(value);

  return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeObservationEntry(observation, defaults = {}) {
  if (typeof observation === 'string') {
    return {
      locId: defaults.locId || null,
      locName: observation,
      obsDt: defaults.obsDt || null,
      howMany: defaults.howMany ?? null,
      lat: normalizeCoordinate(defaults.lat),
      lng: normalizeCoordinate(defaults.lng),
    };
  }

  return {
    ...observation,
    obsDt: observation?.obsDt || defaults.obsDt || null,
    lat: normalizeCoordinate(observation?.lat ?? defaults.lat),
    lng: normalizeCoordinate(observation?.lng ?? defaults.lng),
  };
}

function normalizeObservationList(observations) {
  if (observations?.locations) {
    return observations.locations.map((location) => normalizeObservationEntry(location, {
      obsDt: observations.lstDt || observations.obsDt || null,
    }));
  }

  if (Array.isArray(observations)) {
    return observations.filter(Boolean).map((observation) => normalizeObservationEntry(observation));
  }

  return observations ? [normalizeObservationEntry(observations)] : [];
}

function normalizeXenoCantoObservation(song) {
  if (!song?.loc) {
    return null;
  }

  return {
    locId: null,
    locName: song.loc,
    obsDt: song.date || null,
    howMany: null,
    lat: normalizeCoordinate(song.lat),
    lng: normalizeCoordinate(song.lon),
  };
}

function locationKey(observation) {
  return String(observation?.locName || observation?.location || observation?.locations?.[0] || '')
    .trim()
    .toLowerCase();
}

function uniqueObservations(observations) {
  const seen = new Set();

  return observations.filter((observation) => {
    const key = locationKey(observation);

    if (!key) {
      return true;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function includeExtraObservations(observations, extraObservations) {
  const includedKeys = new Set(observations.map(locationKey).filter(Boolean));
  const additions = [];

  for (const observation of extraObservations) {
    const key = locationKey(observation);

    if (!key || includedKeys.has(key)) {
      continue;
    }

    includedKeys.add(key);
    additions.push(observation);
  }

  return [...observations, ...additions];
}

function selectLatestObservation(observations) {
  const observationList = normalizeObservationList(observations);

  return observationList
    .filter(Boolean)
    .sort((left, right) => parseObservationTime(right) - parseObservationTime(left))[0] || null;
}

function normalizeLastObservation(observation) {
  if (!observation) {
    return null;
  }

  return {
    locId: observation.locId || null,
    locName: observation.locName || observation.location || observation.locations?.[0] || null,
    obsDt: observation.obsDt || null,
    howMany: observation.howMany ?? null,
    lat: normalizeCoordinate(observation.lat),
    lng: normalizeCoordinate(observation.lng),
  };
}

function normalizeRecentObservations(observations, options = {}) {
  const limit = options.limit || 5;
  const extraObservations = Array.isArray(options.extraObservations)
    ? options.extraObservations.filter(Boolean)
    : [];
  const observationList = uniqueObservations([
    ...normalizeObservationList(observations),
    ...extraObservations,
  ])
    .filter(Boolean)
    .sort((left, right) => parseObservationTime(right) - parseObservationTime(left));
  const selectedObservations = includeExtraObservations(
    observationList.slice(0, limit),
    extraObservations
  );
  const locations = selectedObservations.map((observation) => ({
    locId: observation.locId || null,
    locName: observation.locName || observation.location || observation.locations?.[0] || null,
    obsDt: observation.obsDt || null,
    howMany: observation.howMany ?? null,
    lat: normalizeCoordinate(observation.lat),
    lng: normalizeCoordinate(observation.lng),
  }));

  return {
    lastObservedAt: locations[0]?.obsDt || null,
    locationCount: observationList.length,
    locations,
  };
}

function normalizeSong(song) {
  if (!song) {
    return {
      song: null,
      sono: null,
      songLength: null,
      songAttributionHtml: null,
    };
  }

  return {
    song: song.file || null,
    sono: song.sono || null,
    songLength: song.length || null,
    songAttributionHtml: song.attr_html || null,
  };
}

function buildMedia(image, song) {
  return {
    photo: image?.photo || null,
    squarePhoto: image?.squarePhoto || null,
    photoAttribution: image?.attribution || null,
    wikiTitle: image?.wikiTitle || null,
    ...normalizeSong(song),
  };
}

function getDocumentSpeciesCode(document) {
  return document?.metadata?.speciesCode || document?.speciesCode || null;
}

function getDocumentDescription(document) {
  return document?.description || null;
}

function toBirdProfileDocument(bird) {
  const {
    sciName,
    comName,
    speciesCode,
    familyComName,
    familySciName,
    description,
    lastObservation,
    recentObservations,
    media,
  } = bird;
  const observationLocations = recentObservations?.locations
    ?.map((observation) => observation.locName)
    .filter(Boolean) || [];

  return {
    externalId: `bird-${speciesCode}`,
    name: comName,
    family: familyComName,
    description,
    locations: observationLocations,
    documentType: 'bird_profile',
    category: familyComName,
    tags: [comName, sciName, speciesCode, familyComName],
    metadata: {
      speciesCode,
      scientificName: sciName,
      familyScientificName: familySciName,
      lastObservation,
      recentObservations,
      media: {
        photoUrl: media.photo,
        squarePhotoUrl: media.squarePhoto,
        photoAttribution: media.photoAttribution,
        wikiTitle: media.wikiTitle,
        songUrl: media.song,
        sonogramUrl: media.sono,
        songLength: media.songLength,
        songAttributionHtml: media.songAttributionHtml,
      },
    },
  };
}

function hasDescription(document) {
  const description = getDocumentDescription(document);

  return typeof description === 'string' && description.trim().length > 0;
}

function getDescription(image, existingDocument, options = {}) {
  const extract = normalizeDescription(image?.extract);

  if (extract) {
    return extract;
  }

  if (!options.forceDescriptions && hasDescription(existingDocument)) {
    return getDocumentDescription(existingDocument);
  }

  return null;
}

async function buildBirdDocument(speciesCode, taxonomy, sourceData, options = {}) {
  const bird = {
    sciName: taxonomy?.sciName || null,
    comName: taxonomy?.comName || null,
    speciesCode: taxonomy?.speciesCode || speciesCode,
    familyComName: taxonomy?.familyComName || null,
    familySciName: taxonomy?.familySciName || null,
  };
  const image = sourceData.images?.[speciesCode] || null;
  const observationSource = sourceData.observations?.[speciesCode];
  const observation = selectLatestObservation(observationSource);
  const song = sourceData.songs?.[bird.comName] || null;
  const existingDocument = options.existingDocumentsBySpeciesCode?.get(bird.speciesCode) || null;

  return toBirdProfileDocument({
    ...bird,
    description: getDescription(image, existingDocument, options),
    lastObservation: normalizeLastObservation(observation),
    recentObservations: normalizeRecentObservations(observationSource, {
      extraObservations: [normalizeXenoCantoObservation(song)],
    }),
    media: buildMedia(image, song),
  });
}

function documentsBySpeciesCode(documents = []) {
  return new Map(
    documents
      .map((document) => [getDocumentSpeciesCode(document), document])
      .filter(([speciesCode]) => speciesCode)
  );
}

async function buildBirdDocuments(sourceData, options = {}) {
  const documents = [];
  const existingDocumentsBySpeciesCode = options.existingDocumentsBySpeciesCode
    || documentsBySpeciesCode(options.existingDocuments);

  for (const [speciesCode, taxonomy] of Object.entries(sourceData.taxonomy || {})) {
    const document = await buildBirdDocument(speciesCode, taxonomy, sourceData, {
      ...options,
      existingDocumentsBySpeciesCode,
    });

    documents.push(document);

    if (options.onDocument) {
      await options.onDocument(document, documents);
    }
  }

  return documents;
}

async function writeBirdDocuments(documents, options = {}) {
  const outputPath = resolveBirdOutputPath(options);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(documents, null, 2)}\n`, 'utf8');

  return outputPath;
}

function resolveBirdOutputPath(options = {}) {
  const outputDir = options.outputDir || INGESTION_DATA_DIR;

  return options.outputPath || path.join(outputDir, 'birds.json');
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

async function runGenerateIngestCli(args = process.argv.slice(2), options = {}) {
  const { dataset } = parseArgs(args);

  logger.info('Starting ingest data generation', {
    dataset,
  });

  const result = await generateBirdIngestData(options);

  logger.info('Ingest data generation completed', result);

  return result;
}

function closeCliResources() {
  logger.close();
}

if (isMainModule()) {
  runGenerateIngestCli()
    .then(() => {
      closeCliResources();
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Ingest data generation failed', {
        error: error.message,
      });
      closeCliResources();
      process.exit(1);
    });
}

export {
  EXTERNAL_DATA_DIR,
  INGESTION_DATA_DIR,
  SOURCE_FILES,
  SUPPORTED_DATASETS,
  buildBirdDocument,
  buildBirdDocuments,
  buildMedia,
  closeCliResources,
  generateBirdIngestData,
  documentsBySpeciesCode,
  getDocumentDescription,
  getDocumentSpeciesCode,
  hasDescription,
  normalizeLastObservation,
  normalizeCoordinate,
  normalizeXenoCantoObservation,
  normalizeRecentObservations,
  normalizeSong,
  readExistingBirdDocuments,
  parseArgs,
  readBirdSourceData,
  runGenerateIngestCli,
  selectLatestObservation,
  toBirdProfileDocument,
  writeBirdDocuments,
};
