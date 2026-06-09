import chunkingService, {
  countApproximateTokens,
  normalizeWhitespace,
} from '../src/ai/enrichment/services/chunking.service.js';

describe('ChunkingService', () => {
  it('normalizes whitespace before chunking text', () => {
    expect(normalizeWhitespace('  Resplendent\n\nQuetzal   cloud forest.  '))
      .toBe('Resplendent Quetzal cloud forest.');
  });

  it('keeps short documents as a single chunk', () => {
    const chunks = chunkingService.chunkText('Resplendent Quetzals favor mature cloud forest.', {
      targetChunkSize: 400,
      maxChunkSize: 500,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      index: 0,
      content: 'Resplendent Quetzals favor mature cloud forest.',
    });
  });

  it('creates deterministic chunks with metadata and approximate token counts', () => {
    const chunks = chunkingService.chunkText(
      'First sentence about quetzals. Second sentence about Monteverde. Third sentence about Dota.',
      {
        chunkSize: 55,
        chunkOverlap: 10,
        metadata: { family: 'Trogonidae' },
      }
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({
      index: 0,
      metadata: { family: 'Trogonidae' },
    });
    expect(chunks[0].tokenCount).toBe(countApproximateTokens(chunks[0].content));
  });

  it('splits long documents while preserving paragraph boundaries where practical', () => {
    const chunks = chunkingService.chunkText([
      'Monteverde cloud forest has mossy canopy trails. Quetzals feed around fruiting avocado relatives.',
      'San Gerardo de Dota has highland oak forest. Early mornings are best for quiet observation.',
      'Carara National Park protects transition forest. Scarlet Macaws are often seen near the coast.',
    ].join('\n\n'), {
      targetChunkSize: 115,
      maxChunkSize: 150,
      minChunkSize: 40,
      chunkOverlap: 0,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0].content).toContain('Monteverde cloud forest');
    expect(chunks[1].content).toContain('San Gerardo de Dota');
    expect(chunks[2].content).toContain('Carara National Park');
    expect(chunks.every((chunk) => chunk.content.length <= 150)).toBe(true);
  });

  it('adds overlap from the previous chunk without creating duplicate-only chunks', () => {
    const chunks = chunkingService.chunkText([
      'First habitat note about fruiting trees. Second habitat note about canopy cover.',
      'Third habitat note about dawn activity. Fourth habitat note about trail edges.',
    ].join('\n\n'), {
      targetChunkSize: 65,
      maxChunkSize: 150,
      minChunkSize: 30,
      chunkOverlap: 55,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].content).toContain('Second habitat note about canopy cover.');
    expect(chunks[1].content).toContain('Third habitat note about dawn activity.');
    expect(chunks[1].content).not.toBe(chunks[0].content);
  });

  it('merges tiny neighboring chunks when they fit under the maximum size', () => {
    const chunks = chunkingService.chunkText([
      'Tiny note.',
      'Another tiny note.',
      'This longer paragraph gives enough context about sightings near forest edges.',
    ].join('\n\n'), {
      targetChunkSize: 75,
      maxChunkSize: 160,
      minChunkSize: 50,
      chunkOverlap: 0,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('Tiny note.');
    expect(chunks[0].content).toContain('Another tiny note.');
  });

  it('falls back to word boundaries for sentences longer than the maximum size', () => {
    const chunks = chunkingService.chunkText(
      'Quetzal observation requires patient quiet careful slow respectful distant early forest listening practice',
      {
        targetChunkSize: 45,
        maxChunkSize: 55,
        minChunkSize: 20,
        chunkOverlap: 0,
      }
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 55)).toBe(true);
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
  });
});
