import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runContextStrategyComparison } from '../src/evaluations/runners/contextStrategyComparison.runner.js';
import { validateContextStrategyDataset } from '../src/evaluations/datasets/contextStrategyDataset.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    dataset: 'src/evaluations/datasets/context-strategy-dataset.json',
    output: 'tmp/context-strategy-eval-results.json',
    mode: 'fixture',
    repeats: null,
    lastN: 6,
    executor: null,
    trace: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dataset') args.dataset = argv[index += 1];
    else if (argument === '--output') args.output = argv[index += 1];
    else if (argument === '--mode') args.mode = argv[index += 1];
    else if (argument === '--repeats') args.repeats = Number(argv[index += 1]);
    else if (argument === '--last-n') args.lastN = Number(argv[index += 1]);
    else if (argument === '--executor') args.executor = argv[index += 1];
    else if (argument === '--trace') args.trace = true;
    else throw new Error(`Unknown context evaluation argument: ${argument}`);
  }
  if (!['fixture', 'live'].includes(args.mode)) throw new Error('--mode must be fixture or live.');
  if (args.mode === 'live' && !args.executor) {
    throw new Error('Live mode requires --executor <module> exporting executeModel.');
  }
  return args;
}

async function loadExecutor(path) {
  if (!path) return {};
  const resolved = isAbsolute(path) ? path : resolve(rootDir, path);
  const module = await import(pathToFileURL(resolved));
  if (typeof module.executeModel !== 'function' && typeof module.default !== 'function') {
    throw new Error('Live executor module must export executeModel or a default function.');
  }
  return {
    executeModel: module.executeModel || module.default,
    ...(typeof module.judgeModel === 'function' ? { judgeModel: module.judgeModel } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetDocument = validateContextStrategyDataset(JSON.parse(
    await readFile(resolve(rootDir, args.dataset), 'utf8')
  ));
  const executor = await loadExecutor(args.executor);
  const report = await runContextStrategyComparison({
    dataset: datasetDocument.cases,
    ...executor,
    config: {
      mode: args.mode,
      ...(args.repeats ? { repeats: args.repeats } : {}),
      lastN: args.lastN,
      datasetVersion: datasetDocument.datasetVersion,
    },
    trace: args.trace,
  });
  const destination = resolve(rootDir, args.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify({
    ...report,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log([
    `Context strategy evaluation: ${report.acceptance.status.toUpperCase()}`,
    `Cases: ${datasetDocument.cases.length}`,
    `Runs: ${report.perCase.length}`,
    `Last-N: ${args.lastN}`,
    `Mode: ${args.mode}`,
    `Report: ${args.output}`,
  ].join('\n'));
  if (report.acceptance.status === 'failed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Context strategy evaluation failed: ${error.message}`);
  process.exit(1);
});
