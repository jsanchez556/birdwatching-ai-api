import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';

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

export {
  buildJsonFileName,
  isFileFresh,
  isIsoDateFresh,
  readJsonFile,
  readJsonFileOrDefault,
  writeJsonFile,
};
