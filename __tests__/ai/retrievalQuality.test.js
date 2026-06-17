import {
  evaluateRetrievalQuality,
  formatRetrievalQualityLog,
} from '../../src/evaluations/scorers/retrievalQuality.scorer.js';

describe('retrieval quality evaluation', () => {
  test('measures chunk relevance, precision, recall, and grounding quality', () => {
    const input = {
      question: 'Where can I see toucans?',
      retrievedChunks: [
        {
          id: 'A',
          label: 'Chunk A',
          content: 'Toucans are found in Costa Rica rainforest and forest edge habitats.',
        },
        {
          id: 'B',
          label: 'Chunk B',
          content: 'Arenal, Sarapiqui, Tortuguero, and lowland rainforest areas are useful places to look for toucans.',
        },
      ],
      expectedRelevantChunkIds: ['A', 'B'],
      answer: 'Look for toucans around Arenal, Sarapiqui, Tortuguero, and other Costa Rica rainforest areas.',
    };

    const result = evaluateRetrievalQuality(input);

    expect(result.score).toBeGreaterThan(0.85);
    expect(result.retrievedChunkRelevance).toBeGreaterThan(0.85);
    expect(result.retrievalPrecision).toBe(1);
    expect(result.retrievalRecall).toBe(1);
    expect(result.groundingQuality).toBeGreaterThan(0.7);
    expect(result.chunks).toEqual([
      expect.objectContaining({ id: 'A', label: 'Chunk A', relevancePercent: expect.stringMatching(/%$/) }),
      expect.objectContaining({ id: 'B', label: 'Chunk B', relevancePercent: expect.stringMatching(/%$/) }),
    ]);
  });

  test('shows lower precision when irrelevant chunks are retrieved', () => {
    const result = evaluateRetrievalQuality({
      question: 'Where can I see toucans?',
      retrievedChunks: [
        {
          id: 'A',
          content: 'Toucans are common in Costa Rica rainforest canopy and forest edge.',
        },
        {
          id: 'B',
          content: 'Reservation payments and discount codes are handled during checkout.',
        },
      ],
      expectedRelevantChunkIds: ['A'],
      relevanceThreshold: 0.5,
    });

    expect(result.retrievalPrecision).toBe(0.5);
    expect(result.retrievalRecall).toBe(1);
    expect(result.chunks[1].relevance).toBeLessThan(0.5);
  });

  test('formats the retrieval quality log in the expected report shape', () => {
    const input = {
      question: 'Where can I see toucans?',
      retrievedChunks: [
        { id: 'A', label: 'Chunk A', content: 'Toucans occur in Costa Rica rainforest.' },
        { id: 'B', label: 'Chunk B', content: 'Arenal is a useful toucan birding area.' },
      ],
    };
    const result = evaluateRetrievalQuality(input);

    expect(formatRetrievalQualityLog({ ...input, result })).toBe([
      'Question:',
      'Where can I see toucans?',
      '',
      'Retrieved:',
      'Chunk A',
      'Chunk B',
      '',
      'Relevance:',
      `${Math.round(result.retrievedChunkRelevance * 100)}%`,
    ].join('\n'));
  });
});
