import {
  addCompletionUsage,
  estimateCost,
  getCompletionUsageSummary,
} from '../src/ai/telemetry/tokenUsage.js';

describe('AI billing token usage calculations', () => {
  it('estimates chat model request cost from prompt and completion tokens', () => {
    expect(estimateCost('gpt-4o-mini', {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
    })).toBe(0.45);
  });

  it('estimates embedding request cost from input tokens only', () => {
    expect(estimateCost('text-embedding-3-small', {
      promptTokens: 250_000,
      completionTokens: 0,
    })).toBe(0.005);
  });

  it('returns null when pricing is unknown', () => {
    expect(estimateCost('unknown-model', {
      promptTokens: 1000,
      completionTokens: 1000,
    })).toBeNull();
  });

  it('summarizes completion usage and estimated cost', () => {
    expect(getCompletionUsageSummary({
      model: 'gpt-4o-mini',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      },
    })).toEqual({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.00045,
      estimatedCostDisplay: '$0.0004',
    });
  });

  it('aggregates per-model usage for billing correlation', () => {
    const collector = {};

    addCompletionUsage(collector, {
      model: 'gpt-4o-mini',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      },
    });
    addCompletionUsage(collector, {
      model: 'gpt-4o-mini',
      usage: {
        prompt_tokens: 2000,
        completion_tokens: 250,
        total_tokens: 2250,
      },
    });

    expect(collector.openAiUsage).toMatchObject({
      promptTokens: 3000,
      completionTokens: 750,
      totalTokens: 3750,
      hasEstimatedCost: true,
      modelUsage: [
        {
          model: 'gpt-4o-mini',
          promptTokens: 3000,
          completionTokens: 750,
          totalTokens: 3750,
        },
      ],
    });
  });
});
