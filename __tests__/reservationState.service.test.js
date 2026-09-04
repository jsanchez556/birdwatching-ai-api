import { jest } from '@jest/globals';
import {
  ReservationStateService,
  deriveStatus,
} from '../src/services/reservationState.service.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeState(overrides = {}) {
  return {
    version: 0,
    status: 'collecting_information',
    proposed: {},
    confirmed: {},
    reservationId: null,
    bookingIdempotencyKey: null,
    ...overrides,
  };
}

class InMemoryQueries {
  constructor(state = null) {
    this.state = state ? clone(state) : null;
    this.audit = [];
    this.beforeMutate = null;
  }

  async get() {
    return this.state ? clone(this.state) : null;
  }

  async mutate(input) {
    await this.beforeMutate?.();
    const current = this.state || makeState();
    if (current.version !== input.expectedVersion) {
      const error = new Error('version conflict');
      error.code = '40001';
      throw error;
    }
    const next = {
      ...current,
      version: current.version + 1,
      status: input.status,
      proposed: clone(input.proposed),
      confirmed: clone(input.confirmed),
    };
    this.audit.push({
      previousVersion: current.version,
      newVersion: next.version,
      changedFields: input.changedFields,
      previousValues: clone(current),
      resultingValues: clone(next),
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    this.state = next;
    return clone(next);
  }
}

const customerContext = {
  customerName: 'Ana Gomez',
  customerEmail: 'ana@example.com',
  itineraryStartDate: '2026-08-12',
  itineraryEndDate: '2026-08-14',
};

describe('ReservationStateService', () => {
  it('extracts one or multiple validated reservation fields as proposals', async () => {
    const queries = new InMemoryQueries();
    const service = new ReservationStateService({ queries });

    const result = await service.processMessage({
      conversationId: 'conversation-1',
      userId: 7,
      message: 'Tour 9 on August 12 for three, without transfer.',
      extraction: {
        tourId: '9',
        date: '2026-08-12',
        participants: 3,
        transferRequired: false,
        clearedFields: [],
      },
      customerContext,
      sourceId: 'message-1',
    });

    expect(result.state).toMatchObject({
      version: 1,
      status: 'collecting_information',
      proposed: {
        tourId: 9,
        date: '2026-08-12',
        participants: 3,
        transferRequired: false,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
      },
      confirmed: {},
    });
    expect(queries.audit[0]).toMatchObject({
      previousVersion: 0,
      newVersion: 1,
      eventType: 'values_proposed',
      sourceType: 'user_message',
      sourceId: 'message-1',
    });
  });

  it('keeps a confirmed value operational while proposing a correction from three to four', async () => {
    const queries = new InMemoryQueries(makeState({
      version: 4,
      status: 'ready_for_confirmation',
      confirmed: { participants: 3 },
    }));
    const service = new ReservationStateService({ queries });

    const result = await service.processMessage({
      conversationId: 'conversation-1',
      userId: 7,
      message: 'Actually, make it four.',
      extraction: { participants: 4, clearedFields: [] },
      sourceId: 'message-2',
    });

    expect(result.state).toMatchObject({
      version: 5,
      status: 'collecting_information',
      confirmed: { participants: 3 },
      proposed: { participants: 4 },
    });
    expect(queries.audit[0].previousValues.confirmed.participants).toBe(3);
    expect(queries.audit[0].resultingValues.proposed.participants).toBe(4);
  });

  it('represents explicit clearing without treating a missing field as a clear', async () => {
    const queries = new InMemoryQueries(makeState({
      version: 2,
      confirmed: { pickupLocation: 'San Jose' },
    }));
    const service = new ReservationStateService({ queries });

    const unchanged = await service.processMessage({
      conversationId: 'conversation-1',
      message: 'Tell me about toucans.',
      extraction: { clearedFields: [] },
    });
    expect(unchanged.unchanged).toBe(true);
    expect(queries.audit).toHaveLength(0);

    const cleared = await service.processMessage({
      conversationId: 'conversation-1',
      message: 'Clear my pickup location.',
      extraction: { pickupLocation: null, clearedFields: ['pickupLocation'] },
    });
    expect(cleared.state.confirmed.pickupLocation).toBe('San Jose');
    expect(cleared.state.proposed).toEqual({ pickupLocation: null });
  });

  it('leaves invalid or ambiguous values unconfirmed and does not increment for rejected data', async () => {
    const queries = new InMemoryQueries();
    const service = new ReservationStateService({ queries });

    const result = await service.processMessage({
      conversationId: 'conversation-1',
      message: 'Maybe sometime next weekend for a few people.',
      extraction: {
        date: 'next weekend',
        participants: 'a few',
        clearedFields: [],
        confidence: 0.2,
      },
    });

    expect(result).toMatchObject({ unchanged: true, invalidFields: ['date', 'participants'] });
    expect(result.state.version).toBe(0);
    expect(queries.audit).toHaveLength(0);
  });

  it('promotes only through explicit confirmation and preserves superseded values in audit', async () => {
    const queries = new InMemoryQueries(makeState({
      version: 6,
      confirmed: { participants: 3 },
      proposed: { participants: 4 },
    }));
    const service = new ReservationStateService({ queries });

    const result = await service.processMessage({
      conversationId: 'conversation-1',
      message: 'Confirm reservation',
      extraction: { clearedFields: [] },
      sourceId: 'message-confirm',
    });

    expect(result.state).toMatchObject({
      version: 7,
      confirmed: { participants: 4 },
      proposed: {},
    });
    expect(queries.audit[0]).toMatchObject({
      previousVersion: 6,
      newVersion: 7,
      eventType: 'values_confirmed',
      sourceId: 'message-confirm',
    });
    expect(queries.audit[0].previousValues.confirmed.participants).toBe(3);
  });

  it('handles repeated confirmation idempotently without another version', async () => {
    const queries = new InMemoryQueries(makeState({
      version: 7,
      status: 'ready_for_confirmation',
      confirmed: {
        tourId: 9,
        date: '2026-08-12',
        participants: 4,
        transferRequired: false,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
        itineraryStartDate: '2026-08-12',
        itineraryEndDate: '2026-08-14',
      },
    }));
    const service = new ReservationStateService({ queries });

    const result = await service.processMessage({
      conversationId: 'conversation-1',
      message: 'Confirm reservation',
      extraction: { clearedFields: [] },
    });

    expect(result).toMatchObject({ success: true, unchanged: true });
    expect(result.state.version).toBe(7);
    expect(queries.audit).toHaveLength(0);
  });

  it('derives readiness from required confirmed fields and recalculates after change', async () => {
    const confirmed = {
      tourId: 9,
      date: '2026-08-12',
      participants: 4,
      transferRequired: false,
      customerName: 'Ana Gomez',
      customerEmail: 'ana@example.com',
      itineraryStartDate: '2026-08-12',
      itineraryEndDate: '2026-08-14',
    };
    expect(deriveStatus({ confirmed, proposed: {} })).toBe('ready_for_confirmation');
    expect(deriveStatus({ confirmed, proposed: { participants: 5 } })).toBe('collecting_information');
    expect(deriveStatus({ confirmed: { ...confirmed, transferRequired: true }, proposed: {} }))
      .toBe('collecting_information');
  });

  it('rejects stale and concurrent updates without losing the winning write', async () => {
    const queries = new InMemoryQueries();
    const first = new ReservationStateService({ queries });
    const second = new ReservationStateService({ queries });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    queries.beforeMutate = async () => {
      calls += 1;
      if (calls === 1) await gate;
    };

    const firstWrite = first.processMessage({
      conversationId: 'conversation-1',
      message: 'We are three.',
      extraction: { participants: 3, clearedFields: [] },
    });
    const secondWrite = second.processMessage({
      conversationId: 'conversation-1',
      message: 'We are four.',
      extraction: { participants: 4, clearedFields: [] },
    });
    await Promise.resolve();
    release();
    const results = await Promise.all([firstWrite, secondWrite]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => result.code === 'RESERVATION_STATE_CONFLICT')).toHaveLength(1);
    expect(queries.state.version).toBe(1);
    expect([3, 4]).toContain(queries.state.proposed.participants);
    expect(queries.audit).toHaveLength(1);
  });

  it('allows only confirmed to cancelled and treats terminal states safely', async () => {
    const collectingQueries = new InMemoryQueries();
    const collectingService = new ReservationStateService({ queries: collectingQueries });
    await expect(collectingService.processMessage({
      conversationId: 'conversation-1',
      message: 'Cancel reservation',
      extraction: { clearedFields: [] },
    })).resolves.toMatchObject({
      success: false,
      code: 'INVALID_RESERVATION_STATE_TRANSITION',
    });

    const confirmedQueries = new InMemoryQueries(makeState({ version: 8, status: 'confirmed' }));
    const confirmedService = new ReservationStateService({ queries: confirmedQueries });
    const cancelled = await confirmedService.processMessage({
      conversationId: 'conversation-1',
      message: 'Cancel reservation',
      extraction: { clearedFields: [] },
    });
    expect(cancelled.state).toMatchObject({ version: 9, status: 'cancelled' });
  });
});
