import { Client as LangSmithClient } from 'langsmith';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import aiTelemetry from '../../monitoring/aiTelemetry.js';

const WORD_PATTERN = /[a-z0-9]{3,}/gi;
const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'can',
  'for',
  'from',
  'have',
  'here',
  'that',
  'the',
  'this',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with',
  'you',
]);

function clampScore(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Number(Math.max(0, Math.min(numberValue, 1)).toFixed(6));
}

function words(value = '') {
  return [...new Set(String(value).toLowerCase().match(WORD_PATTERN) || [])]
    .filter((word) => !STOP_WORDS.has(word));
}

function overlapScore(left = '', right = '') {
  const leftWords = words(left);
  const rightWords = new Set(words(right));
  if (!leftWords.length || !rightWords.size) return 0;

  return clampScore(leftWords.filter((word) => rightWords.has(word)).length / leftWords.length);
}

function normalizeEvaluationInput(input = {}) {
  const runInputs = input.run?.inputs || {};
  const runOutputs = input.run?.outputs || {};
  const exampleOutputs = input.example?.outputs || {};

  return {
    question: input.question || runInputs.question || runInputs.input || runInputs.message || '',
    answer: input.answer || runOutputs.answer || runOutputs.output || runOutputs.response || '',
    referenceAnswer: input.referenceAnswer || exampleOutputs.answer || exampleOutputs.output || '',
    groundingContext: input.groundingContext || runInputs.groundingContext || runOutputs.groundingContext || {},
    toolResults: input.toolResults || runOutputs.toolResults || runOutputs.tools || [],
    expectedTools: input.expectedTools || exampleOutputs.expectedTools || [],
  };
}

function getRetrievedChunks(groundingContext = {}) {
  if (Array.isArray(groundingContext)) return groundingContext;
  if (Array.isArray(groundingContext.retrievedChunks)) return groundingContext.retrievedChunks;
  if (Array.isArray(groundingContext.sources)) return groundingContext.sources;
  return [];
}

function evaluateGroundingQuality(input = {}) {
  const { answer, groundingContext } = normalizeEvaluationInput(input);
  const chunks = getRetrievedChunks(groundingContext);
  const contextText = chunks
    .map((chunk) => [chunk.name, chunk.location, chunk.locations, chunk.category, chunk.documentType]
      .filter(Boolean)
      .join(' '))
    .join(' ');
  const averageSimilarity = chunks.length
    ? chunks.reduce((sum, chunk) => sum + Number(chunk.similarityScore || chunk.score || 0), 0) / chunks.length
    : 0;
  const coverage = chunks.length ? overlapScore(answer, contextText) : 0;

  return {
    key: 'grounding_quality',
    score: clampScore((coverage * 0.65) + (averageSimilarity * 0.35)),
    comment: `${chunks.length} grounding chunk(s), coverage=${coverage.toFixed(3)}.`,
  };
}

function evaluateAnswerRelevance(input = {}) {
  const { question, answer, referenceAnswer } = normalizeEvaluationInput(input);
  const questionOverlap = overlapScore(question, answer);
  const referenceOverlap = referenceAnswer ? overlapScore(referenceAnswer, answer) : questionOverlap;

  return {
    key: 'answer_relevance',
    score: clampScore((questionOverlap * 0.7) + (referenceOverlap * 0.3)),
    comment: `question_overlap=${questionOverlap.toFixed(3)} reference_overlap=${referenceOverlap.toFixed(3)}.`,
  };
}

function normalizeToolName(value) {
  return typeof value === 'string' ? value : value?.tool || value?.name;
}

function evaluateToolCorrectness(input = {}) {
  const { toolResults, expectedTools } = normalizeEvaluationInput(input);
  const actualTools = (Array.isArray(toolResults) ? toolResults : toolResults?.steps || [])
    .map(normalizeToolName)
    .filter(Boolean);
  const expected = expectedTools.map(normalizeToolName).filter(Boolean);
  const failures = (Array.isArray(toolResults) ? toolResults : toolResults?.errors || [])
    .filter((entry) => entry?.success === false || entry?.code || entry?.error);

  if (!expected.length && !actualTools.length) {
    return {
      key: 'tool_correctness',
      score: failures.length ? 0 : 1,
      comment: failures.length ? `${failures.length} tool failure(s).` : 'No tools expected or required.',
    };
  }

  const sequenceMatches = expected.length === actualTools.length
    && expected.every((toolName, index) => toolName === actualTools[index]);
  const expectedCoverage = expected.length
    ? expected.filter((toolName) => actualTools.includes(toolName)).length / expected.length
    : 1;
  const failurePenalty = failures.length ? Math.min(failures.length * 0.2, 0.6) : 0;

  return {
    key: 'tool_correctness',
    score: clampScore((sequenceMatches ? 1 : expectedCoverage * 0.75) - failurePenalty),
    comment: `${actualTools.length} actual tool(s), ${expected.length} expected, ${failures.length} failure(s).`,
  };
}

function createRunEvaluator(evaluate) {
  return {
    async evaluateRun(run, example) {
      return evaluate({
        run,
        example,
      });
    },
  };
}

const groundingQualityEvaluator = createRunEvaluator(evaluateGroundingQuality);
const answerRelevanceEvaluator = createRunEvaluator(evaluateAnswerRelevance);
const toolCorrectnessEvaluator = createRunEvaluator(evaluateToolCorrectness);

function shouldCreateLangSmithClient(config = env) {
  return Boolean(
    config.nodeEnv !== 'test'
    && config.langChainTracingV2
    && config.langChainApiKey
  );
}

class LangSmithEvaluationTracker {
  constructor({
    config = env,
    client,
    log = logger,
    telemetry = aiTelemetry,
  } = {}) {
    this.config = config;
    this.client = client === undefined && shouldCreateLangSmithClient(config)
      ? new LangSmithClient({ apiKey: config.langChainApiKey })
      : client;
    this.logger = log;
    this.telemetry = telemetry;
  }

  evaluate(input = {}) {
    const results = [
      evaluateGroundingQuality(input),
      evaluateAnswerRelevance(input),
      evaluateToolCorrectness(input),
    ];

    this.logger.info('LangSmith AI evaluations completed', {
      event: 'langsmith_evaluations_completed',
      runId: input.runId,
      scores: Object.fromEntries(results.map((result) => [result.key, result.score])),
    });
    this.telemetry.recordAiEvaluation('langsmith_evaluations_tracked', {
      runId: input.runId,
      scores: Object.fromEntries(results.map((result) => [result.key, result.score])),
    });

    return results;
  }

  async evaluateAndSubmit(input = {}) {
    const results = this.evaluate(input);

    if (!this.client || !input.runId) {
      return results;
    }

    await Promise.all(results.map((result) => this.submitFeedback(input.runId, result)));
    return results;
  }

  async submitFeedback(runId, result) {
    try {
      await this.client.createFeedback(runId, result.key, {
        score: result.score,
        comment: result.comment,
      });
    } catch (error) {
      this.logger.warn('LangSmith evaluation feedback export failed', {
        event: 'langsmith_evaluation_feedback_failed',
        runId,
        key: result.key,
        error: {
          name: error?.name,
          message: error?.message,
          status: error?.status,
        },
      });
    }
  }
}

export {
  evaluateAnswerRelevance,
  evaluateGroundingQuality,
  evaluateToolCorrectness,
  groundingQualityEvaluator,
  LangSmithEvaluationTracker,
};
