import { jest } from '@jest/globals';
import {
  NoopLongTermMemory,
  PostgresLongTermMemory,
  cosineSimilarity,
} from '../src/ai/memory/longTermMemory.js';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function memory(overrides = {}) {
  return {
    id: 1,
    category: 'bird_interests',
    content: 'Interested in hummingbirds.',
    confidence: 0.96,
    sourceMessageId: 42,
    createdAt: '2026-07-01T00:00:00.000Z',
    expiresAt: null,
    isUserEditable: true,
    ...overrides,
  };
}

function buildStore(memories, embeddings, options = {}) {
  const queries = { getActive: jest.fn().mockResolvedValue(memories) };
  const embeddingClient = {
    generateEmbedding: jest.fn().mockResolvedValue(embeddings),
  };
  return {
    queries,
    embeddingClient,
    store: new PostgresLongTermMemory({
      queries,
      embeddingClient,
      clock: () => NOW,
      ...options,
    }),
  };
}

describe('long-term memory adapters', () => {
  it('returns only semantically related memory with source provenance', async () => {
    const memories = [
      memory(),
      memory({
        id: 2,
        category: 'budget_ranges',
        content: 'Prefers tours under USD 100.',
        sourceMessageId: 43,
      }),
    ];
    const { store, queries, embeddingClient } = buildStore(memories, [
      [1, 0],
      [0.95, 0.05],
      [0, 1],
    ]);

    const result = await store.retrieve({
      userId: 7,
      query: 'Which hummingbird is shown in this image?',
      parentTraceId: 'trace-1',
    });

    expect(queries.getActive).toHaveBeenCalledWith(7, 50);
    expect(embeddingClient.generateEmbedding).toHaveBeenCalledWith([
      'Which hummingbird is shown in this image?',
      'Interested in hummingbirds.',
      'Prefers tours under USD 100.',
    ], expect.objectContaining({ userId: 7, parentTraceId: 'trace-1' }));
    expect(result).toEqual([
      expect.objectContaining({
        id: 'user-memory:1',
        content: 'Interested in hummingbirds.',
        sourceId: 42,
        trustLevel: 'explicit_user_memory',
        metadata: expect.objectContaining({
          memoryId: 1,
          sourceMessageId: 42,
          category: 'bird_interests',
          confidence: 0.96,
          semanticSimilarity: expect.any(Number),
          recencyScore: expect.any(Number),
          memoryTokens: expect.any(Number),
          isUserEditable: true,
        }),
      }),
    ]);
  });

  it('filters low-confidence, stale, expired, and invalid-date memories before embedding', async () => {
    const memories = [
      memory(),
      memory({ id: 2, confidence: 0.7 }),
      memory({ id: 3, createdAt: '2023-01-01T00:00:00.000Z' }),
      memory({ id: 4, expiresAt: '2026-07-31T23:59:59.000Z' }),
      memory({ id: 5, createdAt: 'invalid' }),
    ];
    const { store, embeddingClient } = buildStore(memories, [
      [1, 0],
      [1, 0],
    ]);

    const result = await store.retrieve({ userId: 7, query: 'hummingbird preferences' });

    expect(result).toHaveLength(1);
    expect(embeddingClient.generateEmbedding.mock.calls[0][0]).toEqual([
      'hummingbird preferences',
      'Interested in hummingbirds.',
    ]);
  });

  it('deduplicates normalized memory content and keeps the strongest provenance', async () => {
    const memories = [
      memory({ id: 1, confidence: 0.9, createdAt: '2026-06-01T00:00:00Z' }),
      memory({
        id: 2,
        content: '  INTERESTED   in hummingbirds. ',
        confidence: 0.99,
        sourceMessageId: 99,
        createdAt: '2026-07-31T00:00:00Z',
      }),
    ];
    const { store } = buildStore(memories, [
      [1, 0],
      [0.9, 0.1],
      [0.98, 0.02],
    ]);

    const result = await store.retrieve({ userId: 7, query: 'hummingbirds' });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'user-memory:2',
      sourceId: 99,
    }));
  });

  it('enforces the retrieval token cap without truncating memory content', async () => {
    const memories = [
      memory({ id: 1, content: 'First relevant memory.' }),
      memory({ id: 2, content: 'Second relevant memory.' }),
      memory({ id: 3, content: 'Third relevant memory.' }),
    ];
    const { store } = buildStore(memories, [
      [1, 0], [1, 0], [0.9, 0.1], [0.8, 0.2],
    ], {
      tokenEstimator: () => 10,
      maxMemoryTokens: 20,
    });

    const result = await store.retrieve({ userId: 7, query: 'relevant memories' });

    expect(result).toHaveLength(2);
    expect(result.reduce((sum, item) => sum + item.metadata.memoryTokens, 0)).toBe(20);
  });

  it('does not retrieve or embed without an authenticated user or usable query', async () => {
    const { store, queries, embeddingClient } = buildStore([], []);
    await expect(store.retrieve({ query: 'birds' })).resolves.toEqual([]);
    await expect(store.retrieve({ userId: 7, query: '   ' })).resolves.toEqual([]);
    expect(queries.getActive).not.toHaveBeenCalled();
    expect(embeddingClient.generateEmbedding).not.toHaveBeenCalled();
    await expect(new NoopLongTermMemory().retrieve()).resolves.toEqual([]);
  });

  it('does not call embeddings when all database candidates fail thresholds', async () => {
    const { store, embeddingClient } = buildStore([
      memory({ confidence: 0.2 }),
    ], []);
    await expect(store.retrieve({ userId: 7, query: 'hummingbirds' })).resolves.toEqual([]);
    expect(embeddingClient.generateEmbedding).not.toHaveBeenCalled();
  });

  it('excludes memories being superseded by the current explicit correction', async () => {
    const { store, embeddingClient } = buildStore([
      memory({ id: 1, content: 'Prefers morning tours.', category: 'preferences' }),
      memory({ id: 2, content: 'Interested in hummingbirds.' }),
    ], [
      [1, 0],
      [1, 0],
    ]);

    const result = await store.retrieve({
      userId: 7,
      query: 'I now prefer afternoon tours.',
      excludedMemoryIds: [1],
    });

    expect(embeddingClient.generateEmbedding.mock.calls[0][0]).toEqual([
      'I now prefer afternoon tours.',
      'Interested in hummingbirds.',
    ]);
    expect(result.some((item) => item.id === 'user-memory:1')).toBe(false);
  });

  it('calculates bounded cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });
});
