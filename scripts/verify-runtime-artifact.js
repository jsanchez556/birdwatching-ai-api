import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const requiredFiles = [
  'api/server.js',
  'workers/index.js',
  'db/pool.js',
  'db/migrations/001_schema.sql',
  'db/migrations/002_seed.sql',
  'db/migrations/003_functions.sql',
  'db/migrations/004_tour_image_path.sql',
  'ai/prompts/system.prompt.js',
  'config/mediaAssets.json',
  'services/documentIngestion.service.js',
];
const forbiddenPaths = [
  'evaluations',
  'ingestion/data',
];

const failures = [];
for (const relativePath of requiredFiles) {
  await access(path.join(distRoot, relativePath)).catch(() => {
    failures.push(`missing required runtime asset: ${relativePath}`);
  });
}
for (const relativePath of forbiddenPaths) {
  await access(path.join(distRoot, relativePath))
    .then(() => failures.push(`forbidden runtime content present: ${relativePath}`))
    .catch(() => {});
}

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    count += entry.isDirectory()
      ? await countFiles(path.join(directory, entry.name))
      : 1;
  }
  return count;
}

async function totalSize(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    bytes += entry.isDirectory()
      ? await totalSize(entryPath)
      : (await stat(entryPath)).size;
  }
  return bytes;
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'ok',
    files: await countFiles(distRoot),
    artifactBytes: await totalSize(distRoot),
  }));
}
