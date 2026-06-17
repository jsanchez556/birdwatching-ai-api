import {
  buildLangSmithEvaluationDashboards,
  LANGSMITH_EVALUATION_DASHBOARDS,
} from '../../src/evaluations/dashboards/index.js';

const firstRun = {
  run: {
    id: 'run-1',
    timestamp: '2026-06-16T00:00:00.000Z',
  },
  score: {
    v1: {
      score: 0.84,
      answerQuality: 0.82,
      groundingQuality: 0.8,
      retrievalQuality: 0.86,
      toolCorrectness: 0.9,
      costUsd: 0.02,
      tokenUsage: {
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
      },
    },
  },
  evaluation: {
    v1: {
      cases: [
        {
          id: 'case-1',
          category: 'rag_retrieval',
          retrievalQuality: 0.9,
          groundingQuality: 0.8,
          retrieval: {
            retrievalPrecision: 1,
            retrievalRecall: 0.8,
          },
        },
      ],
    },
  },
};

const secondRun = {
  run: {
    id: 'run-2',
    timestamp: '2026-06-17T00:00:00.000Z',
  },
  score: {
    v1: {
      score: 0.8,
      answerQuality: 0.76,
      groundingQuality: 0.78,
      retrievalQuality: 0.7,
      toolCorrectness: 0.9,
      costUsd: 0.018,
      tokenUsage: {
        promptTokens: 90,
        completionTokens: 35,
        totalTokens: 125,
      },
    },
  },
  evaluation: {
    v1: {
      cases: [
        {
          id: 'case-1',
          category: 'rag_retrieval',
          retrievalQuality: 0.7,
          groundingQuality: 0.78,
          retrieval: {
            retrievalPrecision: 0.75,
            retrievalRecall: 0.5,
          },
        },
      ],
    },
  },
};

describe('LangSmith evaluation dashboards', () => {
  test('defines dashboards for quality trends, regression detection, and retrieval performance', () => {
    expect(LANGSMITH_EVALUATION_DASHBOARDS.map((dashboard) => dashboard.id)).toEqual([
      'quality-trends',
      'regression-detection',
      'retrieval-performance',
    ]);
  });

  test('builds quality trend rows from LangSmith evaluation snapshots', () => {
    const dashboards = buildLangSmithEvaluationDashboards({
      runs: [firstRun],
    });

    expect(dashboards.qualityTrends).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        timestamp: '2026-06-16T00:00:00.000Z',
        promptVersion: 'v1',
        score: 0.84,
        answerQuality: 0.82,
        retrievalQuality: 0.86,
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
        },
      }),
    ]);
    expect(dashboards.summary).toMatchObject({
      runCount: 1,
      regressionCount: 0,
    });
  });

  test('detects quality and retrieval regressions between runs', () => {
    const dashboards = buildLangSmithEvaluationDashboards({
      runs: [firstRun, secondRun],
      regressionThreshold: 0.01,
    });
    const latestRegression = dashboards.regressionDetection.find((entry) => entry.runId === 'run-2');

    expect(latestRegression).toMatchObject({
      promptVersion: 'v1',
      hasRegression: true,
      regressions: expect.arrayContaining(['score', 'retrievalQuality', 'answerQuality']),
    });
    expect(latestRegression.scoreDelta).toBe(-0.04);
    expect(latestRegression.retrievalQualityDelta).toBe(-0.16);
    expect(dashboards.summary.regressionCount).toBe(1);
  });

  test('summarizes retrieval performance by case category', () => {
    const dashboards = buildLangSmithEvaluationDashboards({
      runs: [firstRun],
    });

    expect(dashboards.retrievalPerformance).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        promptVersion: 'v1',
        category: 'rag_retrieval',
        caseCount: 1,
        retrievalQuality: 0.9,
        retrievalPrecision: 1,
        retrievalRecall: 0.8,
        groundingQuality: 0.8,
      }),
    ]);
  });
});
