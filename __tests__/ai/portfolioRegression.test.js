import {
  runPortfolioRegression,
} from '../../src/evaluations/runners/portfolioRegression.runner.js';

const dataset = {
  name: 'test-dataset',
  version: 1,
  cases: [
    {
      id: 'rag-1',
      category: 'rag',
      question: 'Where can I see quetzals?',
      expectedBehavior: ['Mentions Monteverde', 'Does not guarantee sightings'],
      evaluationCriteria: ['Uses location evidence'],
    },
    {
      id: 'tool-1',
      category: 'booking',
      question: 'Book a tour without dates.',
      expectedBehavior: ['Requests missing booking details'],
      evaluationCriteria: ['Does not confirm a reservation'],
    },
  ],
};

function artifact(overrides = {}) {
  return {
    schemaVersion: 1,
    evaluationType: 'portfolio_regression',
    artifactId: 'staging-run-1',
    sourceType: 'staging_evaluation',
    provenance: {
      generatedByActualPipeline: true,
      labelsPresentedToPipeline: false,
      modelIdentifier: 'test-model',
      promptVersion: 'test-prompt',
    },
    cases: [
      {
        caseId: 'rag-1',
        assistantResponse: 'Monteverde is a strong place to look for quetzals, although wildlife sightings cannot be guaranteed.',
        retrieval: {
          status: 'evaluated',
          chunks: [{
            id: 'chunk-a',
            content: 'Quetzals inhabit cloud forests around Monteverde in Costa Rica.',
          }],
          expectedRelevantChunkIds: ['chunk-a'],
        },
        toolOutcome: { status: 'not_applicable' },
      },
      {
        caseId: 'tool-1',
        assistantResponse: '',
        error: { code: 'TOOL_TIMEOUT' },
        retrieval: { status: 'not_applicable' },
        toolOutcome: { status: 'failure' },
      },
    ],
    ...overrides,
  };
}

describe('portfolio regression runner', () => {
  test('evaluates supplied pipeline outputs with category metrics and actionable failures', () => {
    const report = runPortfolioRegression({
      dataset,
      outputs: artifact(),
      baseline: {
        thresholds: {
          casePassScore: 0.5,
          overallQuality: 0.3,
          retrievalQuality: 0.2,
          categoryPassRate: 0,
        },
      },
    });

    expect(report).toMatchObject({
      evaluationType: 'portfolio_regression',
      evidenceClass: 'real_pipeline_output',
      validRealPipelineOutputs: true,
      evaluatedCaseCount: 2,
      passedCaseCount: 1,
      failedCaseCount: 1,
      retrievalEvaluatedCaseCount: 1,
      retrievalNotApplicableCaseCount: 1,
      retrievalMissingCaseCount: 0,
    });
    expect(report.categories.rag).toMatchObject({
      evaluatedCaseCount: 1,
      passedCaseCount: 1,
      passRate: 1,
      retrievalEvaluatedCaseCount: 1,
    });
    expect(report.categories.booking).toMatchObject({
      failedCaseCount: 1,
      retrievalQuality: null,
      retrievalNotApplicableCaseCount: 1,
    });
    expect(report.provenance).toMatchObject({
      modelIdentifier: 'test-model',
      promptVersion: 'test-prompt',
      datasetCreationMethod: 'unknown',
      sampleCount: 2,
      categoryDistribution: {
        booking: 1,
        rag: 1,
      },
      generatedByActualPipeline: true,
      labelsPresentedToPipeline: false,
    });
    expect(report.representativeFailures[0]).toEqual(expect.objectContaining({
      caseId: 'tool-1',
      category: 'booking',
      observedOutput: '[pipeline error: TOOL_TIMEOUT]',
      expectedBehavior: ['Requests missing booking details'],
      failureReason: expect.stringContaining('pipeline error: TOOL_TIMEOUT'),
    }));
  });

  test('rejects missing, malformed, and non-pipeline inputs explicitly', () => {
    expect(() => runPortfolioRegression({
      dataset,
      outputs: artifact({ cases: [artifact().cases[0]] }),
    })).toThrow(/missing 1 dataset case/);

    expect(() => runPortfolioRegression({
      dataset,
      outputs: artifact({
        provenance: {
          generatedByActualPipeline: false,
          labelsPresentedToPipeline: false,
        },
      }),
    })).toThrow(/generatedByActualPipeline=true/);

    expect(() => runPortfolioRegression({
      dataset,
      outputs: artifact({
        cases: artifact().cases.map((item) => (
          item.caseId === 'rag-1'
            ? { ...item, retrieval: {} }
            : item
        )),
      }),
    })).toThrow(/retrieval.status/);
  });

  test('rejects evaluated responses and chunks constructed from labels', () => {
    const expectedAnswer = [
      dataset.cases[0].question,
      ...dataset.cases[0].expectedBehavior,
    ].join(' ');
    const expectedChunk = [
      dataset.cases[0].question,
      ...dataset.cases[0].expectedBehavior,
      ...dataset.cases[0].evaluationCriteria,
    ].join(' ');

    expect(() => runPortfolioRegression({
      dataset,
      outputs: artifact({
        cases: artifact().cases.map((item) => (
          item.caseId === 'rag-1'
            ? { ...item, assistantResponse: expectedAnswer }
            : item
        )),
      }),
    })).toThrow(/assistantResponse is derived from evaluation labels/);

    expect(() => runPortfolioRegression({
      dataset,
      outputs: artifact({
        cases: artifact().cases.map((item) => (
          item.caseId === 'rag-1'
            ? {
              ...item,
              retrieval: {
                ...item.retrieval,
                chunks: [{ id: 'label-chunk', content: expectedChunk }],
              },
            }
            : item
        )),
      }),
    })).toThrow(/retrieval\.chunks\[0\]\.content is derived/);
  });

  test('marks missing retrieval explicitly without treating it as success', () => {
    const report = runPortfolioRegression({
      dataset,
      outputs: artifact({
        cases: artifact().cases.map((item) => (
          item.caseId === 'rag-1'
            ? { ...item, retrieval: { status: 'missing' } }
            : item
        )),
      }),
      baseline: { thresholds: { overallQuality: 0, categoryPassRate: 0 } },
    });

    expect(report.retrievalQuality).toBeNull();
    expect(report.retrievalMissingCaseCount).toBe(1);
    expect(report.results[0]).toEqual(expect.objectContaining({
      passed: false,
      retrievalStatus: 'missing',
      failureReason: expect.stringContaining('retrieval output is missing'),
    }));
  });
});
