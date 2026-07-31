import {
  RagContextSelector,
  deduplicateCandidates,
  detectContradictions,
  filterCandidates,
  permissionAllows,
} from '../src/services/rag/contextSelection.js';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function candidate(id, overrides = {}) {
  return {
    id: `external-${id}`,
    documentId: `document-${id}`,
    chunkId: `chunk-${id}`,
    title: `Document ${id}`,
    name: `Document ${id}`,
    source: 'verified-corpus.json',
    category: 'birds',
    locale: 'en-CR',
    tags: ['Costa Rica'],
    locations: 'Monteverde',
    text: `Quetzal habitat passage ${id} with cloud forest evidence.`,
    description: `Quetzal habitat passage ${id} with cloud forest evidence.`,
    score: 0.7,
    active: true,
    documentUpdatedAt: '2026-07-20T00:00:00.000Z',
    metadata: {
      visibility: 'public',
      verified: true,
    },
    documentMetadata: {
      visibility: 'public',
      verified: true,
    },
    ...overrides,
  };
}

describe('RAG context selection pipeline', () => {
  it('filters inactive, expired, future, metadata-mismatched, and unauthorized chunks', () => {
    const documents = [
      candidate(1),
      candidate(2, { active: false }),
      candidate(3, { metadata: { expiresAt: '2026-07-01T00:00:00Z' } }),
      candidate(4, { metadata: { effectiveAt: '2026-09-01T00:00:00Z' } }),
      candidate(5, { category: 'tours' }),
      candidate(6, {
        documentMetadata: { visibility: 'admin' },
        metadata: { visibility: 'admin' },
      }),
      candidate(7, {
        documentMetadata: { visibility: 'private', ownerUserId: 9 },
        metadata: { visibility: 'private', ownerUserId: 9 },
      }),
    ];

    expect(filterCandidates(documents, {
      filters: { category: 'birds' },
      userId: 7,
      role: 'customer',
      now: NOW,
    }).map((document) => document.id)).toEqual(['external-1']);
  });

  it('enforces explicit permission metadata conservatively', () => {
    expect(permissionAllows(candidate(1), {})).toBe(true);
    expect(permissionAllows(candidate(2, {
      documentMetadata: { visibility: 'authenticated' },
    }), {})).toBe(false);
    expect(permissionAllows(candidate(3, {
      documentMetadata: { visibility: 'private' },
    }), { userId: 7, role: 'customer' })).toBe(false);
    expect(permissionAllows(candidate(4, {
      documentMetadata: { visibility: 'private', allowedUserIds: ['7'] },
    }), { userId: 7, role: 'customer' })).toBe(true);
  });

  it('removes near-duplicate chunks while retaining alias citations', () => {
    const first = candidate(1, {
      text: 'Resplendent quetzals inhabit humid cloud forests in Monteverde.',
      description: 'Resplendent quetzals inhabit humid cloud forests in Monteverde.',
      score: 0.8,
    });
    const duplicate = candidate(2, {
      text: 'Resplendent quetzals inhabit humid cloud forests in Monteverde!',
      description: 'Resplendent quetzals inhabit humid cloud forests in Monteverde!',
      score: 0.7,
    });

    const result = deduplicateCandidates([duplicate, first], { now: NOW });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('external-1');
    expect(result.documents[0].citationAliases).toEqual(['document-2:chunk-2']);
    expect(result.duplicateMap.size).toBe(1);
  });

  it('detects contradictory claim metadata without discarding either passage', () => {
    const documents = [
      candidate(1, { metadata: { claimKey: 'quetzal_elevation', claimValue: 'above_1200m' } }),
      candidate(2, { metadata: { claimKey: 'quetzal_elevation', claimValue: 'below_800m' } }),
    ];

    const contradictions = detectContradictions(documents);

    expect(contradictions).toEqual([{
      claimKey: 'quetzal_elevation',
      chunkKeys: ['document-1:chunk-1', 'document-2:chunk-2'],
    }]);
    expect(documents.every((document) => document.metadata.contradiction)).toBe(true);
  });

  it('detects direct positive and negative versions of the same textual claim', () => {
    const documents = [
      candidate(1, {
        text: 'Quetzals are present in this reserve.',
        description: 'Quetzals are present in this reserve.',
        metadata: {},
      }),
      candidate(2, {
        text: 'Quetzals are not present in this reserve.',
        description: 'Quetzals are not present in this reserve.',
        metadata: {},
      }),
    ];

    expect(detectContradictions(documents)).toHaveLength(1);
    expect(deduplicateCandidates(documents, { now: NOW }).documents).toHaveLength(2);
    expect(documents.every((document) => document.metadata.contradiction)).toBe(true);
  });

  it('runs retrieve candidates through filtering, dedup, rerank, compression, budget, and citation assembly', () => {
    const selector = new RagContextSelector({
      clock: () => NOW,
      tokenEstimator: (text) => Math.max(1, Math.ceil(String(text).length / 20)),
    });
    const longText = [
      'Quetzals use cloud forest habitat in Monteverde.',
      'This unrelated sentence discusses generic travel logistics at considerable length.',
      'Fruit availability supports quetzals during the breeding season.',
    ].join(' ');
    const candidates = [
      candidate(1, {
        text: longText,
        description: longText,
        score: 0.76,
        metadata: {
          verified: true,
          lastVerifiedAt: '2026-07-30T00:00:00Z',
          claimKey: 'quetzal_season',
          claimValue: 'march_to_june',
        },
      }),
      candidate(2, {
        text: longText.replace('considerable', 'substantial'),
        description: longText.replace('considerable', 'substantial'),
        score: 0.7,
      }),
      candidate(3, {
        text: 'Old unverified quetzal note from Monteverde.',
        description: 'Old unverified quetzal note from Monteverde.',
        score: 0.85,
        documentUpdatedAt: '2020-01-01T00:00:00Z',
        metadata: { verified: false },
      }),
      candidate(4, {
        text: 'Current verified quetzal nesting information.',
        description: 'Current verified quetzal nesting information.',
        score: 0.8,
      }),
      candidate(5, {
        documentMetadata: { visibility: 'admin' },
        metadata: { visibility: 'admin' },
      }),
      candidate(6, {
        text: 'Current verified toucan information.',
        description: 'Current verified toucan information.',
        score: 0.4,
      }),
    ];

    const result = selector.select(candidates, 'current quetzal cloud forest habitat', {
      userId: 7,
      role: 'customer',
      resultLimit: 4,
      tokenBudget: 100,
      maxChunkTokens: 8,
      maxChunksPerDocument: 1,
    });

    expect(result.report).toEqual(expect.objectContaining({
      candidateCount: 6,
      filteredCount: 5,
      deduplicatedCount: 4,
      selectedCount: 4,
      usedTokens: expect.any(Number),
      tokenBudget: 100,
    }));
    expect(result.documents).toHaveLength(4);
    expect(result.documents[0]).toEqual(expect.objectContaining({
      citationId: 'R1',
      citation: expect.objectContaining({
        documentId: expect.any(String),
        chunkId: expect.any(String),
        source: 'verified-corpus.json',
      }),
      rerankScore: expect.any(Number),
      estimatedTokens: expect.any(Number),
    }));
    expect(result.report.usedTokens).toBeLessThanOrEqual(100);
    expect(result.documents.some((document) => document.compressed)).toBe(true);
    expect(result.documents.some((document) => document.id === 'external-5')).toBe(false);
    expect(result.documents.findIndex((document) => document.id === 'external-4'))
      .toBeLessThan(result.documents.findIndex((document) => document.id === 'external-3'));
  });
});
