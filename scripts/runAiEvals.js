import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { runPortfolioRegression } from '../src/evaluations/runners/portfolioRegression.runner.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATASET_PATH = 'src/evaluations/datasets/golden-dataset.json';
const DEFAULT_BASELINE_PATH = 'src/evaluations/datasets/ai-eval-baseline.json';
const DEFAULT_OUTPUT_PATH = 'tmp/ai-eval-results.json';

function parseArgs(argv) {
  const args = {
    baseline: process.env.AI_EVAL_BASELINE_FILE || DEFAULT_BASELINE_PATH,
    dataset: process.env.AI_EVAL_DATASET_FILE || DEFAULT_DATASET_PATH,
    output: process.env.AI_EVAL_OUTPUT_FILE || DEFAULT_OUTPUT_PATH,
    results: process.env.AI_EVAL_RESULTS_FILE,
    writeBaseline: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--baseline') args.baseline = argv[index += 1];
    else if (arg === '--dataset') args.dataset = argv[index += 1];
    else if (arg === '--output') args.output = argv[index += 1];
    else if (arg === '--results') args.results = argv[index += 1];
    else if (arg === '--write-baseline') args.writeBaseline = true;
    else throw new Error(`Unknown AI evaluation argument: ${arg}`);
  }
  return args;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(rootDir, relativePath), 'utf8'));
}

async function readJsonOrDefault(relativePath, defaultValue) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error.code === 'ENOENT') return defaultValue;
    throw error;
  }
}

async function writeJson(relativePath, data) {
  const destination = resolve(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`);
}

function baselineFromReport(report) {
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    evaluationType: 'portfolio_regression',
    status: 'active',
    createdAt,
    sourceArtifactId: report.sourceArtifactId,
    thresholds: {
      ...report.thresholds,
      overallQuality: report.overallQuality,
      retrievalQuality: report.retrievalQuality ?? report.thresholds.retrievalQuality,
    },
    provenance: {
      ...report.provenance,
      baselineCreationDate: createdAt,
    },
    sampleCount: report.evaluatedCaseCount,
    categoryDistribution: Object.fromEntries(
      Object.entries(report.categories).map(([category, metrics]) => [
        category,
        metrics.evaluatedCaseCount,
      ]),
    ),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.results) {
    throw new Error(
      'Portfolio regression requires --results <real-output-artifact.json> '
      + 'or AI_EVAL_RESULTS_FILE. Synthetic fallback is disabled. '
      + 'Use "npm run ai:evals:self-test" only to validate scorers.',
    );
  }

  const [dataset, outputs, baseline] = await Promise.all([
    readJson(args.dataset),
    readJson(args.results),
    readJson(args.baseline),
  ]);
  const report = runPortfolioRegression({ dataset, outputs, baseline });
  const current = { ...report, generatedAt: new Date().toISOString() };
  const existing = await readJsonOrDefault(args.output, null);
  const history = Array.isArray(existing?.runs)
    ? existing.runs
    : existing?.generatedAt
      ? [existing]
      : [];
  await writeJson(args.output, {
    ...current,
    runs: [...history, current].slice(-100),
  });

  if (args.writeBaseline) {
    await writeJson(args.baseline, baselineFromReport(report));
  }

  console.log([
    `Portfolio regression: ${report.status.toUpperCase()}`,
    `Cases: ${report.evaluatedCaseCount} evaluated, ${report.passedCaseCount} passed, ${report.failedCaseCount} failed`,
    `Quality: ${report.overallQuality}`,
    `Retrieval: ${report.retrievalQuality ?? 'not applicable'} (${report.retrievalEvaluatedCaseCount} evaluated)`,
    `Threshold violations: ${report.thresholdViolations.length}`,
    `Machine-readable report: ${args.output}`,
  ].join('\n'));

  if (report.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Portfolio regression gate failed: ${error.message}`);
  process.exit(1);
});
