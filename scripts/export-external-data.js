import { fileURLToPath } from 'url';
import path from 'path';
import ExternalDataExportService from '../src/external/export.service.js';
import logger from '../src/utils/logger.js';

const SUPPORTED_PROVIDERS = new Set(['taxo', 'songs', 'photos']);
const DEFAULT_PROVIDERS = ['taxo', 'songs', 'photos'];

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args = []) {
  const options = {
    force: false,
    countryCode: 'CR',
    perPage: 500,
  };
  const providers = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--force') {
      options.force = true;
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

    providers.push(arg.toLowerCase());
  }

  if (Number.isNaN(options.perPage) || options.perPage <= 0) {
    throw new Error('--per-page must be a positive number');
  }

  const selectedProviders = providers.length > 0 ? providers : DEFAULT_PROVIDERS;
  const unknownProviders = selectedProviders.filter((provider) => !SUPPORTED_PROVIDERS.has(provider));

  if (unknownProviders.length > 0) {
    throw new Error(`Unsupported external provider(s): ${unknownProviders.join(', ')}`);
  }

  return {
    providers: selectedProviders,
    options,
  };
}

async function runProvider(provider, service, options) {
  if (provider === 'taxo') {
    return service.exportEBird(options);
  }

  if (provider === 'songs') {
    const result = await service.exportXenoCanto(options);
    return [result];
  }

  if (provider === 'photos') {
    const result = await service.exportINaturalist(options);
    return [result];
  }

  return [{
    provider,
    skipped: true,
    reason: 'not-implemented',
  }];
}

async function runExternalDataCli(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);
  const service = options.service || new ExternalDataExportService(options.serviceOptions);
  const results = [];

  logger.info('Starting external data export', {
    providers: parsed.providers,
    options: parsed.options,
  });

  for (const provider of parsed.providers) {
    const providerResults = await runProvider(provider, service, parsed.options);
    results.push(...providerResults);
  }

  logger.info('External data export completed', {
    results,
  });

  return results;
}

function closeCliResources() {
  logger.close();
}

if (isMainModule()) {
  runExternalDataCli()
    .then(() => {
      closeCliResources();
      process.exit(0);
    })
    .catch((error) => {
      logger.error('External data export failed', {
        error: error.message,
      });
      closeCliResources();
      process.exit(1);
    });
}

export {
  DEFAULT_PROVIDERS,
  SUPPORTED_PROVIDERS,
  closeCliResources,
  parseArgs,
  runExternalDataCli,
  runProvider,
};
