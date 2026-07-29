import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  evaluateResponse,
  evaluateRetrievalQuality,
} from '../src/evaluations/scorers/index.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = process.env.AI_SCORER_SELF_TEST_DATASET_FILE
  || 'src/evaluations/datasets/golden-dataset.json';
const baselinePath = process.env.AI_SCORER_SELF_TEST_BASELINE_FILE
  || 'src/evaluations/datasets/scorer-self-test-baseline.json';
const outputPath = process.env.AI_SCORER_SELF_TEST_OUTPUT_FILE
  || 'tmp/ai-scorer-self-test-results.json';

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(rootDir, relativePath), 'utf8'));
}

async function writeJson(relativePath, data) {
  const destination = resolve(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const [dataset, baseline] = await Promise.all([
    readJson(datasetPath),
    readJson(baselinePath),
  ]);
  const results = dataset.cases.map((evaluationCase) => {
    const answer = [
      evaluationCase.question,
      ...(evaluationCase.expectedBehavior || []),
    ].join(' ');
    const retrievedChunks = [{
      id: `${evaluationCase.id}-synthetic-label-chunk`,
      content: [
        evaluationCase.question,
        ...(evaluationCase.expectedBehavior || []),
        ...(evaluationCase.evaluationCriteria || []),
      ].join(' '),
      expectedRelevant: true,
    }];
    const quality = evaluateResponse(evaluationCase, answer, {
      groundingText: retrievedChunks[0].content,
    });
    const retrieval = evaluateRetrievalQuality({
      question: evaluationCase.question,
      retrievedChunks,
      expectedRelevantChunkIds: [retrievedChunks[0].id],
      answer,
    });
    return {
      id: evaluationCase.id,
      category: evaluationCase.category,
      score: quality.score,
      retrievalQuality: retrieval.score,
    };
  });
  const report = {
    schemaVersion: 1,
    evaluationType: 'scorer_self_test',
    displayLabel: 'Synthetic scorer self-test — not model or RAG quality',
    synthetic: true,
    validRealPipelineOutputs: false,
    evidenceUse: 'scorer_implementation_validation_only',
    generatedAt: new Date().toISOString(),
    score: roundScore(average(results.map((result) => result.score))),
    retrievalQuality: roundScore(average(results.map((result) => result.retrievalQuality))),
    caseCount: results.length,
    results,
  };
  await writeJson(outputPath, report);

  if (
    report.score < baseline.score
    || report.retrievalQuality < baseline.retrievalQuality
  ) {
    throw new Error('Synthetic scorer self-test regression detected.');
  }
  console.log([
    'Synthetic scorer self-test: PASSED',
    'Purpose: scorer implementation validation only; not model or RAG quality evidence',
    `Cases: ${report.caseCount}`,
    `Machine-readable report: ${outputPath}`,
  ].join('\n'));
}

main().catch((error) => {
  console.error(`Synthetic scorer self-test failed: ${error.message}`);
  process.exit(1);
});
