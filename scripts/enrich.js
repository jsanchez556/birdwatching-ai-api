import { fileURLToPath } from 'url';
import path from 'path';
import pool from '../src/db/pool.js';
import logger from '../src/utils/logger.js';
import { COSTA_RICA_COUNTRY_CODE } from '../src/utils/constants.utils.js';
import BirdsExportService from '../src/ingestion/services/birdsIngest.service.js';


const SUPPORTED_TARGETS = ['birds'];

const EXTERNAL_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/ingestion',
  'data'
);

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args = []) {
  const options = {
    force: false,
    forceDescriptions: false,
    countryCode: COSTA_RICA_COUNTRY_CODE,
    perPage: 500,
  };
  let target;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--force-descriptions') {
      options.forceDescriptions = true;
      continue;
    }

    if (arg === '--country') {
      options.countryCode = args[index + 1] || options.countryCode;
      index += 1;
      continue;
    }

    if (arg === '--per-page') {
      options.perPage = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (!arg.startsWith('--') && !target) {
      target = arg.toLowerCase();
      continue;
    }

    throw new Error(`Unsupported enrich argument: ${arg}`);
  }

  if (!target) {
    throw new Error('Enrichment target is required. Usage: npm run enrich -- birds');
  }

  if (Number.isNaN(options.perPage) || options.perPage <= 0) {
    throw new Error('--per-page must be a positive number');
  }

  return {
    target,
    options,
  };
}

function unsupportedTargetError(target) {
  return new Error(`Unsupported enrichment target: ${target}. Supported targets: ${SUPPORTED_TARGETS.join(', ')}`);
}

async function runEnrichCli(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);

  logger.info('Starting enrichment pipeline', {
    target: parsed.target,
    options: parsed.options,
  });

  switch (parsed.target) {
    case 'birds': {
      const service = options.birdsExportService || new BirdsExportService({
        ...(options.serviceOptions || {}),
        dataDir: options.dataDir || EXTERNAL_DATA_DIR,
      });
      const result = await service.enrichBirds({
        ...parsed.options,
        ...(options.runnerOptions || {}),
      });

      logger.info('Enrichment pipeline completed', {
        target: parsed.target,
      });

      return result;
    }

    default:
      throw unsupportedTargetError(parsed.target);
  }
}

async function closeCliResources() {
  try {
    await pool.end();
  } finally {
    logger.close();
  }
}

if (isMainModule()) {
  runEnrichCli()
    .then(async () => {
      await closeCliResources();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Enrichment pipeline failed', {
        error: error.message,
      });
      await closeCliResources();
      process.exit(1);
    });
}

export {
  parseArgs,
  runEnrichCli,
};
