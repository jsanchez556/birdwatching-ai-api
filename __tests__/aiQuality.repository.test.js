import { jest } from '@jest/globals';
import {
  AiQualityRepository,
  snapshotsFromPayload,
} from '../src/db/repositories/admin/aiQuality.repository.js';

describe('AiQualityRepository', () => {
  it('reads stored offline numeric snapshots without invoking an evaluator or provider', async () => {
    const readJson = jest.fn().mockResolvedValue({
      generatedAt: '2026-07-02T12:00:00.000Z',
      results: [{
        id: 'case-1',
        groundingScore: 0.8,
        answerRelevance: 0.9,
      }],
    });
    const getFileStat = jest.fn();
    const repository = new AiQualityRepository({
      resultsFile: 'tmp/test-evaluation-results.json',
      readJson,
      getFileStat,
    });

    const snapshots = await repository.getEvaluationSnapshots();

    expect(snapshots).toEqual([expect.objectContaining({
      timestamp: '2026-07-02T12:00:00.000Z',
      results: [expect.objectContaining({ id: 'case-1' })],
    })]);
    expect(readJson).toHaveBeenCalledTimes(1);
    expect(getFileStat).not.toHaveBeenCalled();
  });

  it('returns no snapshots when the configured artifact is absent', async () => {
    const repository = new AiQualityRepository({
      resultsFile: 'tmp/missing-evaluation-results.json',
      readJson: jest.fn().mockResolvedValue(null),
      getFileStat: jest.fn(),
    });

    await expect(repository.getEvaluationSnapshots()).resolves.toEqual([]);
  });

  it('supports historical run arrays and a file timestamp fallback', () => {
    expect(snapshotsFromPayload({
      runs: [{ results: [] }, { timestamp: '2026-07-02T00:00:00.000Z', results: [] }],
    }, '2026-07-01T00:00:00.000Z')).toEqual([
      expect.objectContaining({ timestamp: '2026-07-01T00:00:00.000Z' }),
      expect.objectContaining({ timestamp: '2026-07-02T00:00:00.000Z' }),
    ]);
  });
});
