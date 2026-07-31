import { jest } from '@jest/globals';
import {
  UserMemoryExtractor,
  shouldExtractUserMemory,
  validateMemoryExtraction,
} from '../src/ai/services/userMemoryExtraction.service.js';

function candidate(overrides = {}) {
  return {
    category: 'bird_interests',
    content: 'Interested in hummingbirds and quetzals.',
    confidence: 0.97,
    explicitlyStated: true,
    stable: true,
    usefulAcrossSessions: true,
    safeToRetain: true,
    expiresAt: null,
    isUserEditable: true,
    conflictKey: null,
    conflictResolution: 'none',
    conflictsWithMemoryIds: [],
    supersedesMemoryIds: [],
    ...overrides,
  };
}

function completion(parsed) {
  return {
    id: 'memory-completion-1',
    model: 'structured-model',
    choices: [{ message: { parsed } }],
  };
}

describe('user memory extraction', () => {
  it('accepts explicit stable memories and multiple allowed categories', () => {
    const message = 'I prefer tours under $150, usually travel from San José, and I am interested in hummingbirds.';
    const result = validateMemoryExtraction({
      memories: [
        candidate({
          category: 'budget_ranges',
          content: 'Tour budget is under USD 150.',
        }),
        candidate({
          category: 'recurring_travel_constraints',
          content: 'Usually travels from San José.',
        }),
        candidate({
          content: 'Interested in hummingbirds.',
        }),
      ],
    }, { message });

    expect(result).toEqual({
      success: true,
      memories: [
        expect.objectContaining({ category: 'budget_ranges', confidence: 0.97 }),
        expect.objectContaining({ category: 'recurring_travel_constraints' }),
        expect.objectContaining({ category: 'bird_interests' }),
      ],
      clarificationRequired: [],
    });
  });

  it.each([
    ['weak inference', candidate({ explicitlyStated: false })],
    ['low confidence', candidate({ confidence: 0.6 })],
    ['temporary information', candidate({ stable: false })],
    ['not useful later', candidate({ usefulAcrossSessions: false })],
    ['unsafe retention', candidate({ safeToRetain: false })],
    ['not editable', candidate({ isUserEditable: false })],
  ])('rejects %s instead of turning it into fact', (_label, memory) => {
    const result = validateMemoryExtraction({ memories: [memory] }, {
      message: 'I am interested in hummingbirds and quetzals.',
    });
    expect(result).toEqual({ success: true, memories: [], clarificationRequired: [] });
  });

  it('rejects secrets, direct contact details, and precise addresses', () => {
    const message = 'I prefer contact at bird@example.com and live at 123 Main Street.';
    const result = validateMemoryExtraction({
      memories: [
        candidate({ category: 'preferences', content: 'Contact at bird@example.com.' }),
        candidate({ category: 'recurring_travel_constraints', content: 'Lives at 123 Main Street.' }),
        candidate({ category: 'preferences', content: 'Password is secretbird.' }),
      ],
    }, { message });
    expect(result.memories).toEqual([]);
  });

  it('rejects unsupported details even when a model labels them as explicit', () => {
    const result = validateMemoryExtraction({ memories: [candidate({
      category: 'preferences',
      content: 'Prefers luxury tours.',
    })] }, {
      message: 'I prefer the tour that starts tomorrow.',
    });
    expect(result.memories).toEqual([]);
  });

  it('does not turn a one-off reservation need into a recurring constraint', () => {
    const result = validateMemoryExtraction({ memories: [candidate({
      category: 'recurring_travel_constraints',
      content: 'Requires transportation.',
    })] }, {
      message: 'I need transportation for this tour.',
    });
    expect(result.memories).toEqual([]);
  });

  it('does not store an already active memory', () => {
    const memory = candidate();
    const result = validateMemoryExtraction({ memories: [memory] }, {
      message: 'I am interested in hummingbirds and quetzals.',
      existingMemories: [{ id: 2, category: memory.category, content: memory.content }],
    });
    expect(result.memories).toEqual([]);
  });

  it('allows explicit same-category correction while rejecting invalid supersession IDs', () => {
    const existingMemories = [{ id: 4, category: 'preferred_language', content: 'Prefers English responses.' }];
    const valid = validateMemoryExtraction({ memories: [candidate({
      category: 'preferred_language',
      content: 'Prefers Spanish responses.',
      conflictKey: 'response_language',
      conflictResolution: 'explicit_recent_correction',
      conflictsWithMemoryIds: [4],
      supersedesMemoryIds: [4],
    })] }, {
      message: 'Actually, I prefer Spanish responses now.',
      existingMemories,
    });
    expect(valid.memories[0].supersedesMemoryIds).toEqual([4]);

    const invalid = validateMemoryExtraction({ memories: [candidate({
      category: 'bird_interests',
      content: 'Interested in quetzals.',
      conflictKey: 'bird_interest',
      conflictResolution: 'explicit_recent_correction',
      conflictsWithMemoryIds: [4],
      supersedesMemoryIds: [4],
    })] }, {
      message: 'I am interested in quetzals.',
      existingMemories,
    });
    expect(invalid.memories).toEqual([]);
  });

  it('requires clarification rather than superseding without explicit correction intent', () => {
    const existingMemories = [{
      id: 4,
      category: 'preferences',
      content: 'Prefers morning tours.',
    }];
    const result = validateMemoryExtraction({ memories: [candidate({
      category: 'preferences',
      content: 'Prefers afternoon tours.',
      confidence: 0.82,
      conflictKey: 'tour_time_preference',
      conflictResolution: 'clarification_required',
      conflictsWithMemoryIds: [4],
    })] }, {
      message: 'I prefer afternoon tours.',
      existingMemories,
    });

    expect(result.memories).toEqual([]);
    expect(result.clarificationRequired).toEqual([
      expect.objectContaining({
        category: 'preferences',
        conflictKey: 'tour_time_preference',
        conflictsWithMemoryIds: [4],
      }),
    ]);
  });

  it('downgrades a claimed correction to clarification when correction wording is absent', () => {
    const result = validateMemoryExtraction({ memories: [candidate({
      category: 'preferences',
      content: 'Prefers afternoon tours.',
      conflictKey: 'tour_time_preference',
      conflictResolution: 'explicit_recent_correction',
      conflictsWithMemoryIds: [4],
      supersedesMemoryIds: [4],
    })] }, {
      message: 'I prefer afternoon tours.',
      existingMemories: [{ id: 4, category: 'preferences', content: 'Prefers morning tours.' }],
    });

    expect(result.memories).toEqual([]);
    expect(result.clarificationRequired).toHaveLength(1);
  });

  it('accepts a concise explicit answer to a prior clarification', () => {
    const result = validateMemoryExtraction({ memories: [candidate({
      category: 'preferences',
      content: 'Prefers afternoon tours.',
      conflictKey: 'tour_time_preference',
      conflictResolution: 'explicit_recent_correction',
      conflictsWithMemoryIds: [4],
      supersedesMemoryIds: [4],
    })] }, {
      message: 'Actually, afternoon tours.',
      existingMemories: [{ id: 4, category: 'preferences', content: 'Prefers morning tours.' }],
    });

    expect(result.memories).toEqual([
      expect.objectContaining({
        content: 'Prefers afternoon tours.',
        resolution: 'explicit_recent_correction',
        supersedesMemoryIds: [4],
      }),
    ]);
    expect(result.clarificationRequired).toEqual([]);
  });

  it('skips messages without durable-memory signals, including a single expensive booking', async () => {
    const client = { parseStructuredChatCompletion: jest.fn() };
    const extractor = new UserMemoryExtractor({ client });
    expect(shouldExtractUserMemory('Thank you.')).toBe(false);
    expect(shouldExtractUserMemory('I booked one expensive tour.')).toBe(false);
    await expect(extractor.extract({
      message: 'I booked one expensive tour.',
    })).resolves.toEqual({ success: true, memories: [], skipped: true });
    expect(client.parseStructuredChatCompletion).not.toHaveBeenCalled();
  });

  it('uses strict structured extraction for an explicit preference', async () => {
    const parsed = { memories: [candidate()] };
    const client = {
      parseStructuredChatCompletion: jest.fn().mockResolvedValue(completion(parsed)),
    };
    const extractor = new UserMemoryExtractor({ client });
    await expect(extractor.extract({
      message: 'I am interested in hummingbirds and quetzals.',
      existingMemories: [],
    })).resolves.toEqual(expect.objectContaining({
      success: true,
      memories: [expect.objectContaining({ category: 'bird_interests' })],
    }));
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      expect.objectContaining({
        schemaName: 'user_memory_extraction',
        schema: expect.any(Object),
      })
    );
  });
});
