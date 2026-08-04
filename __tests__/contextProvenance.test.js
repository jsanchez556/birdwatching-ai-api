import { createStableHash } from '../src/utils/hash.utils.js';
import {
  createProvenance,
  toSafeProvenance,
} from '../src/ai/context/contextProvenance.js';
import { ContextBuilder } from '../src/ai/context/contextBuilder.js';
import { selectContextItems } from '../src/ai/context/contextSelector.js';
import { formatContextPackage } from '../src/ai/context/contextFormatter.js';

const NOW = new Date('2026-07-30T22:00:00.000Z');

describe('context provenance', () => {
  it('records complete content-free provenance for every assembled context item', async () => {
    const builder = new ContextBuilder({ clock: () => NOW });
    const context = await builder.build({
      userId: 7,
      conversationId: 'conversation-123',
      task: 'general_chat',
      stage: 'planning',
      userMessage: 'Plan a quiet afternoon tour.',
      model: 'gpt-4o',
      providerMessages: [
        { id: 'system-v1', role: 'system', content: 'Follow platform rules.' },
        { id: 'message-41', role: 'user', content: 'I prefer quiet tours.' },
        { role: 'user', content: 'Plan a quiet afternoon tour.' },
      ],
      memories: [{
        id: 'user-memory:9',
        content: 'Prefers quiet tours.',
        source: 'long_term_memory',
        sourceType: 'long_term_memory',
        sourceId: 41,
        createdAt: '2026-07-01T00:00:00Z',
        expiresAt: '2027-01-01T00:00:00Z',
        trustLevel: 'user_provided',
        metadata: { transformations: ['semantic_retrieval'] },
      }],
    });

    expect(context.traceProvenance).toHaveLength(context.provenance.length);
    expect(context.traceProvenance.length).toBeGreaterThan(0);
    for (const entry of context.traceProvenance) {
      expect(entry).toEqual(expect.objectContaining({
        contextItemId: expect.any(String),
        sourceType: expect.any(String),
        sourceId: expect.any(String),
        retrievedAt: NOW.toISOString(),
        trustLevel: expect.any(String),
        originalContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        validityStatus: expect.stringMatching(/^(valid|expired|invalid|invalid_expiration)$/),
        isValid: expect.any(Boolean),
        transformations: expect.any(Array),
      }));
    }
    const memory = context.traceProvenance.find((entry) => entry.contextItemId === 'user-memory:9');
    expect(memory).toEqual(expect.objectContaining({
      sourceType: 'long_term_memory',
      sourceId: '41',
      expiresAt: '2027-01-01T00:00:00.000Z',
      originalContentHash: createStableHash('Prefers quiet tours.'),
      transformations: ['semantic_retrieval'],
      validityStatus: 'valid',
    }));
    expect(JSON.stringify(context.traceProvenance)).not.toContain('Prefers quiet tours.');
  });

  it('marks malformed and expired items invalid even when they were declared required', () => {
    const base = {
      id: 'required-item',
      type: 'instruction',
      content: 'Temporary instruction.',
      source: 'test',
      trustLevel: 'system',
      createdAt: NOW,
      retrievedAt: NOW,
      estimatedTokens: 5,
      required: true,
      metadata: {},
    };
    const budget = {
      effectiveInputBudget: 100,
      categories: { instructions: { soft: 100, hard: 100 } },
    };

    const expired = selectContextItems([{
      ...base,
      expiresAt: '2026-07-01T00:00:00Z',
    }], budget, { now: NOW });
    const malformed = selectContextItems([{
      ...base,
      id: 'malformed-item',
      expiresAt: 'not-a-date',
    }], budget, { now: NOW });

    expect(expired.selected).toEqual([]);
    expect(expired.provenance[0]).toEqual(expect.objectContaining({
      selectionReason: 'expired',
      validityStatus: 'expired',
      isValid: false,
    }));
    expect(malformed.selected).toEqual([]);
    expect(malformed.provenance[0]).toEqual(expect.objectContaining({
      selectionReason: 'invalid',
      validityStatus: 'invalid_expiration',
      isValid: false,
    }));
  });

  it('hashes unsafe provenance identifiers before trace export', () => {
    const internal = createProvenance({
      id: 'context item containing private text',
      type: 'memory',
      content: 'Sensitive preference text.',
      source: 'unsafe source value',
      sourceType: 'unsafe source type',
      trustLevel: 'user_provided',
      createdAt: NOW,
      retrievedAt: NOW,
      estimatedTokens: 10,
      metadata: { sourceId: 'user@example.com', transformations: ['unsafe value'] },
    }, {}, { now: NOW });
    const [safe] = toSafeProvenance([internal]);

    expect(safe.contextItemId).toMatch(/^context-item:/);
    expect(safe.sourceId).toMatch(/^source:/);
    expect(safe.sourceType).toMatch(/^source-type:/);
    expect(safe.transformations).toEqual(['unrecognized_transformation']);
    expect(JSON.stringify(safe)).not.toContain('Sensitive preference text.');
    expect(JSON.stringify(safe)).not.toContain('user@example.com');
  });

  it('carries provenance between assembly stages without serializing it to the model', async () => {
    const builder = new ContextBuilder({ clock: () => NOW });
    const first = await builder.build({
      userId: null,
      conversationId: 'conversation-123',
      task: 'general_chat',
      stage: 'planning',
      userMessage: 'Where are quetzals?',
      model: 'gpt-4o',
      providerMessages: [
        { id: 'system-v1', role: 'system', content: 'Follow platform rules.' },
        { role: 'user', content: 'Where are quetzals?' },
      ],
    });
    const providerMessages = formatContextPackage(first);
    const sidecar = providerMessages[0].contextProvenance;

    expect(sidecar).toEqual(expect.objectContaining({
      sourceType: 'prompt_asset',
      originalContentHash: createStableHash('Follow platform rules.'),
    }));
    expect(Object.keys(providerMessages[0])).toEqual(['role', 'content']);
    expect(JSON.stringify(providerMessages[0])).not.toContain('contextProvenance');

    const second = await builder.build({
      userId: null,
      conversationId: 'conversation-123',
      task: 'general_chat',
      stage: 'generation',
      userMessage: 'Where are quetzals?',
      model: 'gpt-4o',
      providerMessages,
    });
    expect(second.traceProvenance).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: sidecar.sourceType,
        sourceId: sidecar.sourceId,
        originalContentHash: sidecar.originalContentHash,
      }),
    ]));
  });
});
