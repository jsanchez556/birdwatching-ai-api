import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const EXTERNAL_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data'
);
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const COSTA_RICA_COUNTRY_CODE = 'CR';
const EXTERNAL_PROVIDERS = {
  ebird: 'ebird',
  inaturalist: 'inaturalist',
  xenocanto: 'xenocanto',
};
const EXTERNAL_RESOURCES = {
  costaRicaBirdImages: 'costa-rica-bird-images',
  costaRicaBirdSongs: 'costa-rica-bird-songs',
};

function buildJsonFileName(...parts) {
  return `${parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')}.json`;
}

async function isFileFresh(filePath, maxAgeMs, options = {}) {
  try {
    const fileStat = await stat(filePath);
    const now = options.now || Date.now();

    return now - fileStat.mtimeMs < maxAgeMs;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonFileOrDefault(filePath, defaultValue) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }

    throw error;
  }
}

function toIsoDateOnly(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isIsoDateFresh(dateValue, maxAgeMs, options = {}) {
  if (!dateValue) {
    return false;
  }

  const timestamp = Date.parse(`${dateValue}T00:00:00.000Z`);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  const now = options.now || Date.now();

  return now - timestamp < maxAgeMs;
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export {
  COSTA_RICA_COUNTRY_CODE,
  DAY_MS,
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
};
