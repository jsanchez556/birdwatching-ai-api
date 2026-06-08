import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const {
  calculateRetrievalQuality,
  comparePromptEvaluations,
  PromptEvaluationTracker,
} = await import('../src/ai/evaluations/promptEvaluation.tracker.js');

describe('PromptEvaluationTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates retrieval quality from scores, coverage, and grounding context', () => {
    expect(calculateRetrievalQuality({
      resultCount: 2,
      topK: 4,
      scores: [0.9, 0.7],
      hasGroundingContext: true,
    })).toBe(0.76);
  });

  it('compares prompt versions across retrieval quality, token usage, and latency', () => {
    expect(comparePromptEvaluations({
      promptVersion: '1.0.0',
      retrieval: {
        resultCount: 1,
        topK: 3,
        scores: [0.6],
      },
      tokenUsage: {
        promptTokens: 1000,
        completionTokens: 250,
      },
      latencyMs: 1200,
    }, {
      promptVersion: '2.0.0',
      retrievalQuality: 0.88,
      tokenUsage: {
        promptTokens: 900,
        completionTokens: 220,
        totalTokens: 1120,
      },
      latencyMs: 900,
    })).toMatchObject({
      promptV1: {
        promptVersion: '1.0.0',
        retrievalQuality: 0.586667,
        tokenUsage: {
          promptTokens: 1000,
          completionTokens: 250,
          totalTokens: 1250,
        },
        latencyMs: 1200,
      },
      promptV2: {
        promptVersion: '2.0.0',
        retrievalQuality: 0.88,
        tokenUsage: {
          promptTokens: 900,
          completionTokens: 220,
          totalTokens: 1120,
        },
        latencyMs: 900,
      },
      deltas: {
        retrievalQuality: 0.293333,
        totalTokens: -130,
        promptTokens: -100,
        completionTokens: -30,
        latencyMs: -300,
        score: 0.297633,
      },
      winner: '2.0.0',
    });
  });

  it('logs prompt comparison telemetry without prompt text', () => {
    const telemetry = {
      recordAiError: jest.fn(),
    };
    const tracker = new PromptEvaluationTracker({
      log: mockLogger,
      telemetry,
    });

    const comparison = tracker.compare({
      promptVersion: '1.0.0',
      retrievalQuality: 0.5,
      tokenUsage: { totalTokens: 1000 },
      latencyMs: 1000,
    }, {
      promptVersion: '2.0.0',
      retrievalQuality: 0.6,
      tokenUsage: { totalTokens: 900 },
      latencyMs: 800,
    }, {
      experimentId: 'prompt-ab-1',
    });

    expect(comparison.winner).toBe('2.0.0');
    expect(mockLogger.info).toHaveBeenCalledWith('Prompt version comparison evaluated', {
      event: 'prompt_version_comparison',
      promptV1: '1.0.0',
      promptV2: '2.0.0',
      retrievalQualityDelta: 0.1,
      totalTokenDelta: -100,
      latencyDeltaMs: -200,
      winner: '2.0.0',
      metadata: {
        experimentId: 'prompt-ab-1',
      },
    });
    expect(telemetry.recordAiError).toHaveBeenCalledWith('prompt_evaluation_tracked', {
      promptV1: '1.0.0',
      promptV2: '2.0.0',
      winner: '2.0.0',
      retrievalQualityDelta: 0.1,
      totalTokenDelta: -100,
      latencyDeltaMs: -200,
      metadata: {
        experimentId: 'prompt-ab-1',
      },
    });
  });
});
