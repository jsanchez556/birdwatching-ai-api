import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  evaluateResponse,
  evaluateRetrievalQuality,
} from '../src/evaluations/scorers/index.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATASET_PATH = 'src/evaluations/datasets/golden-dataset.json';
const DEFAULT_BASELINE_PATH = 'src/evaluations/datasets/ai-eval-baseline.json';
const DEFAULT_OUTPUT_PATH = 'tmp/ai-eval-results.json';
const EPSILON = 0.000001;

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
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(rootDir, path), 'utf8'));
}

async function readJsonOrDefault(path, defaultValue) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === 'ENOENT') return defaultValue;
    throw error;
  }
}

async function writeJson(path, data) {
  const destination = resolve(rootDir, path);

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`);
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function buildSyntheticAnswer(evaluationCase) {
  return [
    evaluationCase.question,
    ...(evaluationCase.expectedBehavior || []),
  ].join(' ');
}

function buildSyntheticChunks(evaluationCase) {
  return [
    {
      id: `${evaluationCase.id}-expected`,
      label: 'Expected behavior chunk',
      content: [
        evaluationCase.question,
        ...(evaluationCase.expectedBehavior || []),
        ...(evaluationCase.evaluationCriteria || []),
      ].join(' '),
      expectedRelevant: true,
    },
  ];
}

function normalizeExternalResults(payload) {
  const score = payload.score ?? payload.evaluationScore ?? payload.overallScore;
  const retrievalQuality = payload.retrievalQuality
    ?? payload.retrievedChunkRelevance
    ?? payload.retrieval?.score;

  if (!Number.isFinite(Number(score)) || !Number.isFinite(Number(retrievalQuality))) {
    throw new Error('AI evaluation results must include numeric score and retrievalQuality.');
  }

  return {
    score: roundScore(score),
    retrievalQuality: roundScore(retrievalQuality),
    source: 'external-results',
  };
}

async function computeGoldenDatasetResults(datasetPath) {
  const dataset = await readJson(datasetPath);
  const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
  const results = cases.map((evaluationCase) => {
    const answer = buildSyntheticAnswer(evaluationCase);
    const retrievedChunks = buildSyntheticChunks(evaluationCase);
    const quality = evaluateResponse(evaluationCase, answer, {
      groundingText: retrievedChunks.map((chunk) => chunk.content).join(' '),
    });
    const retrieval = evaluateRetrievalQuality({
      question: evaluationCase.question,
      retrievedChunks,
      expectedRelevantChunkIds: retrievedChunks.map((chunk) => chunk.id),
      answer,
    });

    return {
      id: evaluationCase.id,
      category: evaluationCase.category,
      score: quality.score,
      groundingScore: retrieval.groundingQuality,
      answerRelevance: quality.relevance,
      retrievalQuality: retrieval.score,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    score: roundScore(average(results.map((result) => result.score))),
    retrievalQuality: roundScore(average(results.map((result) => result.retrievalQuality))),
    caseCount: results.length,
    source: dataset.name || datasetPath,
    results,
  };
}

function assertNoRegression(current, baseline) {
  const failures = [];

  if (current.score + EPSILON < baseline.score) {
    failures.push(`evaluation score dropped from ${baseline.score} to ${current.score}`);
  }

  if (current.retrievalQuality + EPSILON < baseline.retrievalQuality) {
    failures.push(`retrieval quality dropped from ${baseline.retrievalQuality} to ${current.retrievalQuality}`);
  }

  if (failures.length) {
    throw new Error(`AI evaluation regression detected: ${failures.join('; ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const measured = args.results
    ? normalizeExternalResults(await readJson(args.results))
    : await computeGoldenDatasetResults(args.dataset);
  const current = {
    ...measured,
    generatedAt: measured.generatedAt || new Date().toISOString(),
  };
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
    await writeJson(args.baseline, {
      score: current.score,
      retrievalQuality: current.retrievalQuality,
      source: current.source,
      caseCount: current.caseCount,
    });
  }

  const baseline = await readJson(args.baseline);

  assertNoRegression(current, baseline);

  console.log(JSON.stringify({
    status: 'passed',
    score: current.score,
    retrievalQuality: current.retrievalQuality,
    baseline: {
      score: baseline.score,
      retrievalQuality: baseline.retrievalQuality,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
