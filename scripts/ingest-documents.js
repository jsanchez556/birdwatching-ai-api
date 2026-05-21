import { readFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import ingestionService from '../src/db/ingestion/ingestion.service.js';
import pool from '../src/db/pool.js';
import logger from '../src/utils/logger.js';

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/db/ingestion/data'
);
const SUPPORTED_EXTENSIONS = new Set(['.json']);

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args = []) {
  const force = args.includes('--force');
  const files = args.filter((arg) => arg !== '--force' && arg !== '--all');

  return {
    force,
    all: args.includes('--all') || files.length === 0,
    files,
  };
}

function normalizeFileName(fileName) {
  const extension = path.extname(fileName);
  return extension ? fileName : `${fileName}.json`;
}

function assertSafeDataPath(fileName, dataDir = DATA_DIR) {
  const normalizedFileName = normalizeFileName(fileName);
  const filePath = path.resolve(dataDir, normalizedFileName);
  const relativePath = path.relative(dataDir, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to read outside src/db/ingestion/data: ${fileName}`);
  }

  return filePath;
}

async function discoverSupportedFiles(dataDir = DATA_DIR) {
  const entries = await readdir(dataDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

function parseJson(rawContent, fileName = 'dataset.json') {
  const parsed = JSON.parse(rawContent);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  throw new Error(`Invalid ingestion dataset shape in ${fileName}: expected a JSON array of normalized documents`);
}

async function readDocumentsFromFile(fileName, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const filePath = assertSafeDataPath(fileName, dataDir);
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

      const summary = await ingestionService.ingestDocuments(parsed.documents, {
        force: options.force,
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

async function runIngestionCli(args = process.argv.slice(2), options = {}) {
  const parsedArgs = parseArgs(args);
  const fileNames = parsedArgs.all
    ? await discoverSupportedFiles(options.dataDir)
    : parsedArgs.files;

  if (fileNames.length === 0) {
    logger.warn('No supported ingestion files found');
    return [];
  }

  logger.info('Starting document ingestion', {
    fileCount: fileNames.length,
    files: fileNames,
    force: parsedArgs.force,
  });

  const results = await ingestFiles(fileNames, {
    dataDir: options.dataDir,
    force: parsedArgs.force,
  });

  logger.info('Document ingestion completed', {
    fileCount: results.length,
    documentCount: results.reduce((sum, result) => sum + (result.documentCount || 0), 0),
    chunkCount: results.reduce((sum, result) => sum + (result.chunkCount || 0), 0),
    skippedCount: results.reduce((sum, result) => sum + (result.skippedCount || 0), 0),
  });

  return results;
}

async function closeCliResources() {
  try {
    await pool.end();
  } finally {
    logger.close();
  }
}

if (isMainModule()) {
  runIngestionCli()
    .then(async () => {
      await closeCliResources();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Document ingestion failed', {
        error: error.message,
      });
      await closeCliResources();
      process.exit(1);
    });
}

export {
  DATA_DIR,
  SUPPORTED_EXTENSIONS,
  assertSafeDataPath,
  closeCliResources,
  discoverSupportedFiles,
  ingestFiles,
  normalizeFileName,
  parseArgs,
  parseJson,
  readDocumentsFromFile,
  runIngestionCli,
};
