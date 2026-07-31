import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildModelRoutingEvaluationReport } from '../src/evaluations/runners/modelRoutingEvaluation.runner.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATASET_PATH = 'src/evaluations/datasets/golden-dataset.json';
const DEFAULT_OUTPUT_PATH = 'tmp/model-routing-evaluation-report.json';
const REAL_SOURCE_TYPES = new Set([
  'recorded_production_like',
  'staging_evaluation',
  'external_pipeline_fixture',
]);

function parseArgs(argv) {
  const args = {
    dataset: process.env.MODEL_ROUTING_EVAL_DATASET_FILE || DEFAULT_DATASET_PATH,
    results: process.env.MODEL_ROUTING_EVAL_RESULTS_FILE,
    output: process.env.MODEL_ROUTING_EVAL_OUTPUT_FILE || DEFAULT_OUTPUT_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dataset') args.dataset = argv[index += 1];
    else if (argument === '--results') args.results = argv[index += 1];
    else if (argument === '--output') args.output = argv[index += 1];
    else throw new Error(`Unknown model-routing evaluation argument: ${argument}`);
  }
  return args;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(rootDir, relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  const destination = resolve(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`);
}

function validateArtifact(artifact) {
  if (artifact?.schemaVersion !== 1
    || artifact?.evaluationType !== 'model_routing_execution_results') {
    throw new Error('Results must be a model-routing execution artifact with schemaVersion 1.');
  }
  if (!REAL_SOURCE_TYPES.has(artifact.sourceType)) {
    throw new Error('Results must identify a real production-like or staging source type.');
  }
  if (artifact.provenance?.generatedByActualPipeline !== true
    || artifact.provenance?.labelsPresentedToPipeline !== false) {
    throw new Error(
      'Results provenance must attest actual-pipeline generation without evaluation labels.',
    );
  }
  if (!Array.isArray(artifact.runs) || artifact.runs.length === 0) {
    throw new Error('Results artifact must contain measured runs.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.results) {
    throw new Error(
      'Model-routing comparison requires --results <paired-execution-artifact.json> '
      + 'or MODEL_ROUTING_EVAL_RESULTS_FILE. Numeric benchmark values are never synthesized.',
    );
  }
  const [dataset, artifact] = await Promise.all([
    readJson(args.dataset),
    readJson(args.results),
  ]);
  validateArtifact(artifact);
  const report = buildModelRoutingEvaluationReport({
    dataset,
    runs: artifact.runs,
    provenance: {
      ...artifact.provenance,
      sourceArtifactId: artifact.artifactId,
      sourceType: artifact.sourceType,
    },
  });
  await writeJson(args.output, report);

  console.log([
    'Model-routing comparison: COMPLETE',
    `Cases per arm: ${report.dataset.caseCount}`,
    `Single model success: ${report.summary.singleModel.successRate}`,
    `Routed models success: ${report.summary.routedModels.successRate}`,
    `Single model average latency: ${report.summary.singleModel.averageLatencyMs} ms`,
    `Routed models average latency: ${report.summary.routedModels.averageLatencyMs} ms`,
    `Single model average cost: ${report.summary.singleModel.averageCost ?? 'unavailable'}`,
    `Routed models average cost: ${report.summary.routedModels.averageCost ?? 'unavailable'}`,
    `Machine-readable report: ${args.output}`,
  ].join('\n'));
}

main().catch((error) => {
  console.error(`Model-routing evaluation failed: ${error.message}`);
  process.exit(1);
});
