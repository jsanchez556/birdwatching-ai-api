import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const distRoot = path.join(projectRoot, 'dist');

const runtimeDirectories = [
  'ai',
  'analytics',
  'api',
  'cache',
  'config',
  'constants',
  'db',
  'events',
  'experiments',
  'featureFlags',
  'ingestion',
  'jobs',
  'monitoring',
  'observability',
  'providers',
  'queues',
  'runtime',
  'services',
  'storage',
  'tracing',
  'utils',
  'workers',
];

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

for (const directory of runtimeDirectories) {
  await cp(path.join(sourceRoot, directory), path.join(distRoot, directory), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source);
      return relative !== path.join('ingestion', 'data')
        && !relative.startsWith(`${path.join('ingestion', 'data')}${path.sep}`);
    },
  });
}

console.log(`Built shared API/worker runtime from ${runtimeDirectories.length} explicit directories.`);
