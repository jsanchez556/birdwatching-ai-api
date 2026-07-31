import { jest } from '@jest/globals';
import {
  UserMemoryService,
  memoryFingerprint,
} from '../src/services/userMemory.service.js';

describe('UserMemoryService', () => {
  it('persists accepted memories with source provenance and deduplication fingerprint', async () => {
    const existing = [{ id: 2, category: 'bird_interests', content: 'Interested in toucans.' }];
    const queries = {
      getActive: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (memory) => ({ id: 9, ...memory })),
    };
    const extractor = {
      extract: jest.fn().mockResolvedValue({
        success: true,
        memories: [{
          category: 'budget_ranges',
          content: 'Tour budget is under USD 150.',
          confidence: 0.96,
          expiresAt: null,
          isUserEditable: true,
          conflictKey: 'tour_budget',
          resolution: 'none',
          supersedesMemoryIds: [],
        }],
      }),
    };
    const service = new UserMemoryService({ queries, extractor });

    const result = await service.capture({
      userId: 7,
      message: 'I prefer tours under $150.',
      sourceMessageId: 42,
      conversationId: 'conversation-1',
    });

    expect(extractor.extract).toHaveBeenCalledWith(expect.objectContaining({
      message: 'I prefer tours under $150.',
      existingMemories: existing,
    }));
    expect(queries.save).toHaveBeenCalledWith({
      userId: 7,
      category: 'budget_ranges',
      content: 'Tour budget is under USD 150.',
      contentFingerprint: memoryFingerprint('budget_ranges', 'Tour budget is under USD 150.'),
      confidence: 0.96,
      sourceMessageId: 42,
      expiresAt: null,
      isUserEditable: true,
      conflictKey: 'tour_budget',
      resolution: 'none',
      supersedesMemoryIds: [],
    });
    expect(result.stored).toHaveLength(1);
  });

  it('does not run for visitors or messages without a durable source row', async () => {
    const queries = { getActive: jest.fn(), save: jest.fn() };
    const extractor = { extract: jest.fn() };
    const service = new UserMemoryService({ queries, extractor });
    await expect(service.capture({ message: 'I prefer Spanish.' }))
      .resolves.toMatchObject({ skipped: true, stored: [] });
    expect(queries.getActive).not.toHaveBeenCalled();
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('treats database duplicates as successful no-op writes', async () => {
    const queries = {
      getActive: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(null),
    };
    const extractor = {
      extract: jest.fn().mockResolvedValue({
        success: true,
        memories: [{
          category: 'preferred_language',
          content: 'Prefers Spanish responses.',
          confidence: 0.99,
          expiresAt: null,
          isUserEditable: true,
          supersedesMemoryIds: [],
        }],
      }),
    };
    const service = new UserMemoryService({ queries, extractor });
    await expect(service.capture({
      userId: 7,
      message: 'I prefer Spanish responses.',
      sourceMessageId: 42,
    })).resolves.toEqual({ success: true, stored: [], resolutions: [] });
  });

  it('returns an auditable explicit recent correction resolution', async () => {
    const existing = [{
      id: 4,
      category: 'preferences',
      content: 'Prefers morning tours.',
      conflictKey: 'tour_time_preference',
    }];
    const queries = {
      getActive: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockResolvedValue({
        id: 5,
        category: 'preferences',
        content: 'Prefers afternoon tours.',
      }),
    };
    const extractor = {
      extract: jest.fn().mockResolvedValue({
        success: true,
        clarificationRequired: [],
        memories: [{
          category: 'preferences',
          content: 'Prefers afternoon tours.',
          confidence: 0.98,
          expiresAt: null,
          isUserEditable: true,
          conflictKey: 'tour_time_preference',
          resolution: 'explicit_recent_correction',
          supersedesMemoryIds: [4],
        }],
      }),
    };
    const service = new UserMemoryService({ queries, extractor });

    await expect(service.capture({
      userId: 7,
      message: 'I now prefer afternoon tours.',
      sourceMessageId: 43,
    })).resolves.toEqual(expect.objectContaining({
      resolutions: [{
        activeMemory: 'Prefers afternoon tours.',
        supersededMemory: 'Prefers morning tours.',
        resolution: 'explicit_recent_correction',
      }],
    }));
    expect(queries.save).toHaveBeenCalledWith(expect.objectContaining({
      conflictKey: 'tour_time_preference',
      resolution: 'explicit_recent_correction',
      supersedesMemoryIds: [4],
    }));
  });
});
