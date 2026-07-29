import { runPromptRegression } from '../../src/evaluations/runners/promptRegression.runner.js';

const dataset = [
  {
    id: 'toucan-location',
    category: 'rag_retrieval',
    question: 'Where can I see toucans?',
    expectedBehavior: [
      'mentions Costa Rica toucan locations',
      'does not guarantee sightings',
    ],
    evaluationCriteria: [
      'Does not invent guaranteed sightings',
    ],
  },
];

describe('prompt regression runner', () => {
  test('compares prompt quality, cost, token usage, and cost efficiency', async () => {
    const result = await runPromptRegression({
      prompts: {
        v1: 'Prompt V1',
        v2: 'Prompt V2',
      },
      dataset,
      expectedRelevantChunksByCaseId: {
        'toucan-location': ['A'],
      },
      executePrompt: async ({ promptVersion }) => {
        if (promptVersion === 'v1') {
          return {
            answer: 'Costa Rica has toucans.',
            retrievedChunks: [
              { id: 'A', content: 'Toucans occur in Costa Rica rainforest locations.' },
            ],
            latencyMs: 1200,
            costUsd: 0.002,
            usage: {
              prompt_tokens: 130,
              completion_tokens: 50,
              total_tokens: 180,
            },
          };
        }

        return {
          answer: 'Look for toucans in Costa Rica rainforest locations. Sightings are not guaranteed.',
          retrievedChunks: [
            { id: 'A', content: 'Toucans occur in Costa Rica rainforest locations.' },
          ],
          latencyMs: 800,
          costUsd: 0.001,
          tokenUsage: {
            promptTokens: 100,
            completionTokens: 40,
            totalTokens: 140,
          },
        };
      },
    });

    expect(result.v2.quality).toBeGreaterThan(result.v1.quality);
    expect(result.v2.costUsd).toBeLessThan(result.v1.costUsd);
    expect(result.v2.tokenUsage).toEqual({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
    });
    expect(result.v1.tokenUsage).toEqual({
      promptTokens: 130,
      completionTokens: 50,
      totalTokens: 180,
    });
    expect(result.comparison).toMatchObject({
      bestQuality: 'v2',
      lowestCost: 'v2',
      mostCostEfficient: 'v2',
    });
    expect(result.comparison.versions.v2.qualityPerDollar)
      .toBeGreaterThan(result.comparison.versions.v1.qualityPerDollar);
  });

  test('requires an executePrompt function', async () => {
    await expect(runPromptRegression({
      prompts: { v1: 'Prompt V1' },
      dataset,
    })).rejects.toThrow('runPromptRegression requires an executePrompt function.');
  });
});
