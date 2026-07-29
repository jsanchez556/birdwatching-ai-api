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
  evaluateAnswerRelevance,
  evaluateGroundingQuality,
  evaluateToolCorrectness,
  groundingQualityEvaluator,
  LangSmithEvaluationTracker,
} = await import('../src/ai/telemetry/langSmithEvaluators.js');

describe('LangSmith AI evaluators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scores grounding quality from retrieved context overlap and similarity', () => {
    expect(evaluateGroundingQuality({
      answer: 'Resplendent Quetzal is commonly seen in Monteverde cloud forest.',
      groundingContext: {
        retrievedChunks: [
          {
            name: 'Resplendent Quetzal',
            location: 'Monteverde cloud forest',
            similarityScore: 0.9,
          },
        ],
      },
    })).toEqual({
      key: 'grounding_quality',
      score: 0.779286,
      comment: '1 grounding chunk(s), coverage=0.714.',
    });
  });

  it('scores answer relevance against question and optional reference answer', () => {
    expect(evaluateAnswerRelevance({
      question: 'Where can I see quetzals in Costa Rica?',
      answer: 'You can see quetzals in Monteverde and Savegre in Costa Rica.',
      referenceAnswer: 'Quetzals are often seen in Monteverde.',
    })).toMatchObject({
      key: 'answer_relevance',
      score: 0.85,
    });
  });

  it('scores tool correctness from expected sequence and failures', () => {
    expect(evaluateToolCorrectness({
      expectedTools: ['searchTours', 'checkAvailability', 'calculatePricing'],
      toolResults: {
        steps: [
          { tool: 'searchTours' },
          { tool: 'checkAvailability' },
          { tool: 'calculatePricing' },
        ],
        errors: [],
      },
    })).toEqual({
      key: 'tool_correctness',
      score: 1,
      comment: '3 actual tool(s), 3 expected, 0 failure(s).',
    });

    expect(evaluateToolCorrectness({
      expectedTools: ['searchTours', 'checkAvailability', 'calculatePricing'],
      toolResults: {
        steps: [
          { tool: 'searchTours' },
          { tool: 'calculatePricing' },
        ],
        errors: [{ tool: 'calculatePricing', code: 'TOOL_EXECUTION_FAILED' }],
      },
    })).toMatchObject({
      key: 'tool_correctness',
      score: 0.3,
    });
  });

  it('provides LangSmith run evaluator wrappers', async () => {
    await expect(groundingQualityEvaluator.evaluateRun({
      inputs: {
        groundingContext: {
          retrievedChunks: [{ name: 'Scarlet Macaw', location: 'Carara', similarityScore: 0.8 }],
        },
      },
      outputs: {
        answer: 'Scarlet Macaws are visible around Carara.',
      },
    })).resolves.toMatchObject({
      key: 'grounding_quality',
      score: expect.any(Number),
    });
  });

  it('submits evaluator feedback to LangSmith when a run ID is provided', async () => {
    const client = {
      createFeedback: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
    };
    const telemetry = {
      recordAiEvaluation: jest.fn(),
    };
    const tracker = new LangSmithEvaluationTracker({
      client,
      log: mockLogger,
      telemetry,
    });

    const results = await tracker.evaluateAndSubmit({
      runId: 'run-1',
      question: 'Where can I see quetzals?',
      answer: 'You can see quetzals in Monteverde.',
      groundingContext: {
        retrievedChunks: [{ name: 'Resplendent Quetzal', location: 'Monteverde', similarityScore: 0.9 }],
      },
      expectedTools: ['searchTours'],
      toolResults: {
        steps: [{ tool: 'searchTours' }],
        errors: [],
      },
    });

    expect(results.map((result) => result.key)).toEqual([
      'grounding_quality',
      'answer_relevance',
      'tool_correctness',
    ]);
    expect(client.createFeedback).toHaveBeenCalledTimes(3);
    expect(client.createFeedback).toHaveBeenCalledWith('run-1', 'grounding_quality', expect.objectContaining({
      score: expect.any(Number),
      comment: expect.any(String),
    }));
    expect(mockLogger.info).toHaveBeenCalledWith('LangSmith AI evaluations completed', expect.objectContaining({
      event: 'langsmith_evaluations_completed',
      runId: 'run-1',
      scores: expect.objectContaining({
        grounding_quality: expect.any(Number),
        answer_relevance: expect.any(Number),
        tool_correctness: expect.any(Number),
      }),
    }));
    expect(telemetry.recordAiEvaluation).toHaveBeenCalledWith('langsmith_evaluations_tracked', expect.objectContaining({
      runId: 'run-1',
    }));
  });

  it('keeps feedback export failures non-fatal', async () => {
    const tracker = new LangSmithEvaluationTracker({
      client: {
        createFeedback: jest.fn().mockRejectedValue(new Error('LangSmith down')),
      },
      log: mockLogger,
      telemetry: {
        recordAiEvaluation: jest.fn(),
      },
    });

    await expect(tracker.evaluateAndSubmit({
      runId: 'run-1',
      answer: 'No tools were needed.',
    })).resolves.toHaveLength(3);
    expect(mockLogger.warn).toHaveBeenCalledWith('LangSmith evaluation feedback export failed', expect.objectContaining({
      event: 'langsmith_evaluation_feedback_failed',
      runId: 'run-1',
    }));
  });
});
