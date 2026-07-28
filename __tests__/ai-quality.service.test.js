import { jest } from '@jest/globals';
import {
  AiQualityService,
  previousRange,
} from '../src/admin/ai-quality.service.js';

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
});
