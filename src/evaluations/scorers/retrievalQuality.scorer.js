import { normalizeWhitespace } from '../../utils/text.utils.js';
import {
  average,
  clampScore,
  formatScorePercent,
  roundScore,
  tokenCoverage,
} from './scoring.utils.js';

const DEFAULT_RELEVANCE_THRESHOLD = 0.35;

function normalizeChunk(chunk, index) {
  if (typeof chunk === 'string') {
    return {
      id: `chunk-${index + 1}`,
      label: `Chunk ${String.fromCharCode(65 + index)}`,
      content: normalizeWhitespace(chunk),
    };
  }

  const id = normalizeWhitespace(chunk?.id || chunk?.chunkId || `chunk-${index + 1}`);

  return {
    id,
    label: normalizeWhitespace(chunk?.label || chunk?.title || `Chunk ${String.fromCharCode(65 + index)}`),
    content: normalizeWhitespace(chunk?.content || chunk?.text || chunk?.body || chunk?.summary || ''),
    expectedRelevant: Boolean(chunk?.expectedRelevant || chunk?.relevant),
  };
}

function normalizeExpectedRelevantIds(chunks, expectedRelevantChunkIds = []) {
  const explicitIds = new Set(expectedRelevantChunkIds.map((id) => String(id)));
  const chunkMarkedIds = chunks
    .filter((chunk) => chunk.expectedRelevant)
    .map((chunk) => chunk.id);

  return new Set([...explicitIds, ...chunkMarkedIds]);
}

function scoreChunkRelevance(question, chunk) {
  const questionCoverage = tokenCoverage(question, chunk.content);
  const chunkFocus = tokenCoverage(chunk.content, question);
  const relevance = clampScore((questionCoverage * 0.9) + (chunkFocus * 0.1));

  return {
    id: chunk.id,
    label: chunk.label,
    relevance: roundScore(relevance),
    relevancePercent: formatScorePercent(relevance),
  };
}

function buildReasoning({
  retrievedChunks,
  relevantRetrievedCount,
  expectedRelevantCount,
  averageRelevance,
  precision,
  recall,
  groundingQuality,
  hasAnswer,
}) {
  return {
    relevance: `${retrievedChunks.length} retrieved chunks averaged ${formatScorePercent(averageRelevance)} relevance to the question.`,
    precision: `${relevantRetrievedCount} of ${retrievedChunks.length} retrieved chunks met the relevance threshold, for ${formatScorePercent(precision)} precision.`,
    recall: expectedRelevantCount
      ? `${relevantRetrievedCount} of ${expectedRelevantCount} expected relevant chunks were retrieved, for ${formatScorePercent(recall)} recall.`
      : `No expected relevant chunk IDs were supplied, so recall falls back to threshold coverage at ${formatScorePercent(recall)}.`,
    groundingQuality: hasAnswer
      ? `Answer overlap with retrieved chunks produced ${formatScorePercent(groundingQuality)} grounding quality.`
      : `No answer was supplied, so grounding quality uses retrieved chunk relevance at ${formatScorePercent(groundingQuality)}.`,
  };
}

export function evaluateRetrievalQuality({
  question,
  retrievedChunks = [],
  expectedRelevantChunkIds = [],
  answer = '',
  relevanceThreshold = DEFAULT_RELEVANCE_THRESHOLD,
} = {}) {
  const normalizedQuestion = normalizeWhitespace(question);
  const chunks = retrievedChunks.map(normalizeChunk);
  const chunkScores = chunks.map((chunk) => scoreChunkRelevance(normalizedQuestion, chunk));
  const expectedRelevantIds = normalizeExpectedRelevantIds(chunks, expectedRelevantChunkIds);
  const relevantChunkIds = new Set(
    chunkScores
      .filter((chunk) => chunk.relevance >= relevanceThreshold || expectedRelevantIds.has(chunk.id))
      .map((chunk) => chunk.id),
  );
  const relevantRetrievedCount = chunkScores
    .filter((chunk) => relevantChunkIds.has(chunk.id))
    .length;
  const expectedRetrievedCount = chunkScores
    .filter((chunk) => expectedRelevantIds.has(chunk.id))
    .length;
  const averageRelevance = average(chunkScores.map((chunk) => chunk.relevance));
  const precision = chunks.length ? relevantRetrievedCount / chunks.length : 0;
  const recall = expectedRelevantIds.size
    ? expectedRetrievedCount / expectedRelevantIds.size
    : precision;
  const retrievedText = chunks.map((chunk) => chunk.content).join(' ');
  const normalizedAnswer = normalizeWhitespace(answer);
  const groundingQuality = normalizedAnswer
    ? tokenCoverage(normalizedAnswer, retrievedText)
    : averageRelevance;

  return {
    score: roundScore((
      averageRelevance * 0.3
      + precision * 0.25
      + recall * 0.25
      + groundingQuality * 0.2
    )),
    retrievedChunkRelevance: roundScore(averageRelevance),
    retrievalPrecision: roundScore(precision),
    retrievalRecall: roundScore(recall),
    groundingQuality: roundScore(groundingQuality),
    reasoning: buildReasoning({
      retrievedChunks: chunks,
      relevantRetrievedCount,
      expectedRelevantCount: expectedRelevantIds.size,
      averageRelevance,
      precision,
      recall,
      groundingQuality,
      hasAnswer: Boolean(normalizedAnswer),
    }),
    chunks: chunkScores,
  };
}

export function formatRetrievalQualityLog({
  question,
  retrievedChunks = [],
  result,
} = {}) {
  const chunks = retrievedChunks.map(normalizeChunk);
  const resolvedResult = result || evaluateRetrievalQuality({ question, retrievedChunks });
  const retrievedList = chunks.length
    ? chunks.map((chunk) => chunk.label).join('\n')
    : 'No chunks retrieved';

  return [
    'Question:',
    normalizeWhitespace(question),
    '',
    'Retrieved:',
    retrievedList,
    '',
    'Relevance:',
    formatScorePercent(resolvedResult.retrievedChunkRelevance),
  ].join('\n');
}

export default evaluateRetrievalQuality;
