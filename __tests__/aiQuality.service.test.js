import { jest } from '@jest/globals';
import {
  AiQualityService,
  previousRange,
} from '../src/services/admin/aiQuality.service.js';

const currentRange = {
  startAt: '2026-07-01T00:00:00.000Z',
  endAt: '2026-07-03T00:00:00.000Z',
};

function repositoryWith(snapshots) {
  return {
    getEvaluationSnapshots: jest.fn().mockResolvedValue(snapshots),
  };
}

describe('AiQualityService', () => {
  it('uses an immediately preceding UTC interval with the same duration', () => {
    expect(previousRange(currentRange)).toEqual({
      startAt: '2026-06-29T00:00:00.000Z',
      endAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('aggregates valid scores, missing values, and evaluated tool execution semantics', async () => {
    const repository = repositoryWith([
      {
        evaluationType: 'portfolio_regression',
        validRealPipelineOutputs: true,
        evidenceClass: 'real_pipeline_output',
        timestamp: '2026-06-30T12:00:00.000Z',
        cases: [
          {
            groundingQuality: 0.6,
            answerRelevance: 0.7,
            retrievalQuality: 0.8,
            evaluatedToolExecutions: { successful: 1, total: 2 },
          },
          {
            groundingQuality: null,
            answerRelevance: 0.9,
            retrievalQuality: 0.6,
          },
        ],
      },
      {
        evaluationType: 'portfolio_regression',
        validRealPipelineOutputs: true,
        evidenceClass: 'real_pipeline_output',
        provenance: { modelIdentifier: 'recorded-model' },
        timestamp: '2026-07-01T00:00:00.000Z',
        cases: [
          {
            groundingQuality: 0.8,
            answerRelevance: 0.9,
            retrievalQuality: 0.7,
            evaluatedToolExecutions: { successful: 2, total: 2 },
          },
          {
            groundingQuality: 1,
            answerRelevance: null,
            retrievalQuality: 0.9,
            evaluatedToolExecutions: { successful: 1, total: 2 },
          },
          {
            groundingQuality: 'invalid',
            answerRelevance: 0.6,
            retrievalQuality: null,
          },
        ],
      },
      {
        evaluationType: 'portfolio_regression',
        validRealPipelineOutputs: true,
        evidenceClass: 'real_pipeline_output',
        provenance: { modelIdentifier: 'recorded-model' },
        timestamp: '2026-07-03T00:00:00.000Z',
        cases: [{
          groundingQuality: 0,
          answerRelevance: 0,
          retrievalQuality: 0,
        }],
      },
    ]);
    const service = new AiQualityService({ repository });

    await expect(service.getQualitySummary(currentRange)).resolves.toEqual({
      range: { ...currentRange, timezone: 'UTC' },
      previousRange: {
        startAt: '2026-06-29T00:00:00.000Z',
        endAt: '2026-07-01T00:00:00.000Z',
        timezone: 'UTC',
      },
      qualityStatus: 'available',
      qualitySource: 'real_pipeline_output',
      unavailableReason: null,
      provenance: {
        sourceType: null,
        sourceArtifactId: null,
        collectedAt: null,
        modelIdentifier: 'recorded-model',
        promptVersion: null,
        retrievalIndexVersion: null,
        evaluatorVersion: null,
        scoringVersion: null,
        provenanceReference: null,
      },
      scorerSelfTest: {
        label: 'Synthetic scorer self-test — not model or RAG quality',
        includedInQualityMetrics: false,
        availableInConfiguredArtifact: false,
      },
      metrics: {
        groundingScore: {
          current: 0.9,
          previous: 0.6,
          delta: 0.3,
          currentSampleSize: 2,
          previousSampleSize: 1,
        },
        answerRelevance: {
          current: 0.75,
          previous: 0.8,
          delta: -0.05,
          currentSampleSize: 2,
          previousSampleSize: 2,
        },
        retrievalQuality: {
          current: 0.8,
          previous: 0.7,
          delta: 0.1,
          currentSampleSize: 2,
          previousSampleSize: 2,
        },
        toolSuccessRate: {
          current: 0.75,
          previous: 0.5,
          delta: 0.25,
          currentSampleSize: 4,
          previousSampleSize: 2,
        },
      },
    });
    expect(repository.getEvaluationSnapshots).toHaveBeenCalledTimes(1);
  });

  it('returns null values and deltas with zero samples for empty periods', async () => {
    const service = new AiQualityService({ repository: repositoryWith([]) });

    const result = await service.getQualitySummary(currentRange);

    expect(result).toMatchObject({
      qualityStatus: 'unavailable',
      qualitySource: null,
      provenance: null,
      scorerSelfTest: {
        includedInQualityMetrics: false,
        availableInConfiguredArtifact: false,
      },
    });
    for (const metric of Object.values(result.metrics)) {
      expect(metric).toEqual({
        current: null,
        previous: null,
        delta: null,
        currentSampleSize: 0,
        previousSampleSize: 0,
      });
    }
  });

  it('keeps delta null when either period has no usable observation', async () => {
    const service = new AiQualityService({
      repository: repositoryWith([{
        evaluationType: 'portfolio_regression',
        validRealPipelineOutputs: true,
        evidenceClass: 'real_pipeline_output',
        timestamp: '2026-07-02T00:00:00.000Z',
        results: [{ answerRelevance: 0.81 }],
      }]),
    });

    const result = await service.getQualitySummary(currentRange);

    expect(result.metrics.answerRelevance).toEqual({
      current: 0.81,
      previous: null,
      delta: null,
      currentSampleSize: 1,
      previousSampleSize: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('excludes synthetic scorer self-tests and legacy unlabeled artifacts from quality', async () => {
    const service = new AiQualityService({
      repository: repositoryWith([
        {
          evaluationType: 'scorer_self_test',
          synthetic: true,
          timestamp: '2026-07-02T00:00:00.000Z',
          results: [{
            groundingScore: 1,
            answerRelevance: 1,
            retrievalQuality: 1,
          }],
        },
        {
          timestamp: '2026-07-02T00:00:00.000Z',
          score: 0.9839,
          retrievalQuality: 0.9796,
        },
      ]),
    });

    const result = await service.getQualitySummary(currentRange);

    expect(result.qualityStatus).toBe('unavailable');
    expect(result.scorerSelfTest).toEqual(expect.objectContaining({
      availableInConfiguredArtifact: true,
      includedInQualityMetrics: false,
    }));
    expect(result.metrics.retrievalQuality).toEqual(expect.objectContaining({
      current: null,
      currentSampleSize: 0,
    }));
  });
});
