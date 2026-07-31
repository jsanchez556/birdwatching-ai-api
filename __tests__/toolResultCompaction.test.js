import { readFile } from 'node:fs/promises';
import { jest } from '@jest/globals';
import {
  compactToolResults,
  shouldCompactToolResult,
} from '../src/ai/compaction/toolResultCompactor.js';
import { persistLargeToolResult } from '../src/ai/compaction/toolResultReference.js';
import { ToolResultReferenceService } from '../src/services/toolResultReference.service.js';
import { ToolExecutor } from '../src/ai/tools/tool.executor.js';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function largeTourResult(count = 20) {
  return {
    success: true,
    total: 47,
    pagination: {
      page: 1,
      pageSize: 20,
      total: 47,
      totalPages: 3,
      hasMore: true,
      nextCursor: 'page-2',
      internalToken: 'do-not-expose',
    },
    tours: Array.from({ length: count }, (_, index) => ({
      id: `tour_${index + 1}`,
      name: `Tour ${index + 1}`,
      location: 'Monteverde',
      pricePerPerson: 100 + index,
      currency: 'USD',
      difficulty: 'easy',
      description: 'A deliberately detailed tour description that should not be repeated.',
      internalMargin: 0.32,
      supplierContractId: `supplier-${index + 1}`,
      databaseCreatedAt: '2026-01-01T00:00:00Z',
      availability: [{ date: `2026-08-${String(index + 3).padStart(2, '0')}`, available: true }],
    })),
  };
}

describe('tool result compaction', () => {
  it('summarizes large search results and retains action identifiers, totals, and pagination', () => {
    const result = largeTourResult();
    Object.defineProperty(result, 'resultReferenceId', {
      value: 'search_tours_abc123',
      enumerable: false,
    });

    expect(shouldCompactToolResult(result)).toBe(true);
    const [contextItem] = compactToolResults([{
      tool: 'searchTours',
      result,
    }], { now: NOW });
    const compacted = JSON.parse(contextItem.content).result;

    expect(compacted).toEqual(expect.objectContaining({
      resultReferenceId: 'search_tours_abc123',
      total: 47,
      omittedResultCount: 42,
      pagination: {
        page: 1,
        pageSize: 20,
        total: 47,
        totalPages: 3,
        hasMore: true,
        nextCursor: 'page-2',
      },
    }));
    expect(compacted.selectedResults).toHaveLength(5);
    expect(compacted.selectedResults[0]).toEqual({
      tourId: 'tour_1',
      name: 'Tour 1',
      location: 'Monteverde',
      price: 100,
      currency: 'USD',
      nextAvailableDate: '2026-08-03',
      difficulty: 'easy',
    });
    expect(contextItem.content).not.toContain('internalMargin');
    expect(contextItem.content).not.toContain('supplierContractId');
    expect(contextItem.content).not.toContain('databaseCreatedAt');
    expect(contextItem.content).not.toContain('do-not-expose');
    expect(contextItem.content.length).toBeLessThan(JSON.stringify(result).length / 3);
  });

  it('stores the complete result while placing only its opaque reference in metadata', async () => {
    const result = largeTourResult(10);
    const store = {
      store: jest.fn().mockResolvedValue({
        referenceId: 'search_tours_abc123',
        expiresAt: '2026-08-08T00:00:00.000Z',
      }),
    };
    const metadata = { conversationId: 'conversation-123', userId: 7 };

    await expect(persistLargeToolResult({
      toolName: 'searchTours',
      result,
      metadata,
      store,
    })).resolves.toEqual(expect.objectContaining({ referenceId: 'search_tours_abc123' }));

    expect(store.store).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'searchTours',
      result,
      total: 47,
      conversationId: 'conversation-123',
      userId: 7,
    }));
    expect(result.resultReferenceId).toBe('search_tours_abc123');
    expect(JSON.stringify(result)).not.toContain('resultReferenceId');
    expect(metadata.toolResultReferences).toEqual([expect.objectContaining({
      referenceId: 'search_tours_abc123',
      toolName: 'searchTours',
      total: 47,
    })]);
  });

  it('still compacts safely when durable reference storage is unavailable', async () => {
    const result = largeTourResult(10);
    const logger = { warn: jest.fn() };

    await expect(persistLargeToolResult({
      toolName: 'searchTours',
      result,
      metadata: { conversationId: 'conversation-123', userId: 7 },
      store: { store: jest.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: 'ECONNREFUSED' })) },
      logger,
    })).resolves.toBeNull();

    const compacted = JSON.parse(compactToolResults([{
      tool: 'searchTours',
      result,
    }])[0].content).result;
    expect(compacted.resultReferenceUnavailable).toBe(true);
    expect(JSON.stringify(compacted)).not.toContain('internalMargin');
    expect(logger.warn).toHaveBeenCalledWith('Tool result reference storage failed', {
      toolName: 'searchTours',
      conversationId: 'conversation-123',
      code: 'ECONNREFUSED',
    });
  });

  it('retrieves complete results only through the caller-scoped reference contract', async () => {
    const queries = {
      save: jest.fn().mockImplementation(async (value) => ({
        referenceId: value.referenceId,
        toolName: value.toolName,
        total: value.total,
        expiresAt: value.expiresAt,
      })),
      get: jest.fn().mockResolvedValue({
        referenceId: 'search_tours_fixed-id',
        toolName: 'searchTours',
        result: largeTourResult(),
      }),
    };
    const service = new ToolResultReferenceService({
      queries,
      idFactory: () => 'fixed-id',
      clock: () => NOW,
    });
    const stored = await service.store({
      toolName: 'searchTours',
      result: largeTourResult(),
      total: 47,
      conversationId: 'conversation-123',
      userId: 7,
    });
    const retrieved = await service.retrieve({
      referenceId: stored.referenceId,
      conversationId: 'conversation-123',
      userId: 7,
    });

    expect(stored.referenceId).toBe('search_tours_fixed-id');
    expect(queries.get).toHaveBeenCalledWith({
      referenceId: 'search_tours_fixed-id',
      conversationId: 'conversation-123',
      userId: 7,
    });
    expect(retrieved.result.tours).toHaveLength(20);
  });

  it('keeps complete results available to dependent plan steps while recording a reference', async () => {
    const fullResult = largeTourResult(10);
    const toolResultStore = {
      store: jest.fn().mockResolvedValue({ referenceId: 'search_tours_plan-ref' }),
    };
    const dependentStep = jest.fn((args, metadata) => ({
      success: true,
      firstTourId: metadata.agentExecutionContext.results.search.tours[0].id,
      originalField: metadata.agentExecutionContext.results.search.tours[0].internalMargin,
    }));
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue(fullResult),
      inspectResult: dependentStep,
    }, { toolResultStore });
    const metadata = { conversationId: 'conversation-123', userId: 7 };

    const execution = await executor.executePlan({
      steps: [
        { id: 'search', tool: 'searchTours', args: {} },
        { id: 'inspect', tool: 'inspectResult', args: {} },
      ],
    }, metadata);

    expect(execution.results.search.tours).toHaveLength(10);
    expect(execution.results.inspect).toEqual(expect.objectContaining({
      firstTourId: 'tour_1',
      originalField: 0.32,
    }));
    expect(metadata.toolResultReferences).toEqual([
      expect.objectContaining({ referenceId: 'search_tours_plan-ref', total: 47 }),
    ]);
  });

  it('defines expiring, conversation-scoped storage without a raw-result public endpoint', async () => {
    const sql = await readFile(
      new URL('../src/db/migrations/030_create_tool_result_references.sql', import.meta.url),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS tool_result_references');
    expect(sql).toContain('conversation_code TEXT NOT NULL');
    expect(sql).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('get_tool_result_reference');
    expect(sql).toContain('stored.conversation_code = p_conversation_code');
    expect(sql).toContain('stored.expires_at > CURRENT_TIMESTAMP');
  });
});
