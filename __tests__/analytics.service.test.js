import { jest } from '@jest/globals';
import {
  AnalyticsService,
  deterministicEventId,
} from '../src/analytics/analytics.service.js';

describe('AnalyticsService', () => {
  it('maps safe events to the configured provider', () => {
    const provider = {
      capture: jest.fn(),
      shutdown: jest.fn(),
    };
    const analytics = new AnalyticsService({
      provider,
      environment: 'development',
      service: 'test-api',
    });

    expect(analytics.track({
      userId: 7,
      event: 'reservation_completed',
      properties: {
        conversationId: 'conversation-1',
        tourId: 3,
        participants: 2,
        customerEmail: 'private@example.test',
        message: 'private chat content',
        nested: { private: true },
      },
      idempotencyKey: 'provider:event-1',
    })).toBe(true);

    expect(provider.capture).toHaveBeenCalledWith({
      distinctId: '7',
      event: 'reservation_completed',
      properties: {
        environment: 'development',
        service: 'test-api',
        userId: '7',
        conversationId: 'conversation-1',
        tourId: 3,
        participants: 2,
        $insert_id: deterministicEventId('reservation_completed', 'provider:event-1'),
      },
    });
  });

  it('supports anonymous conversation identities and disabled mode', () => {
    const provider = { capture: jest.fn() };
    const enabledAnalytics = new AnalyticsService({ provider });
    const disabledAnalytics = new AnalyticsService({ provider: null });

    expect(enabledAnalytics.track({
      anonymousId: 'conversation:abc',
      event: 'chat_message_sent',
    })).toBe(true);
    expect(provider.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'conversation:abc',
    }));
    expect(disabledAnalytics.track({
      userId: 7,
      event: 'chat_message_sent',
    })).toBe(false);
  });

  it('swallows provider failures and shuts down safely', async () => {
    const analyticsLogger = {
      warn: jest.fn(),
    };
    const provider = {
      capture: jest.fn(() => {
        throw new Error('provider secret must not be logged');
      }),
      shutdown: jest.fn().mockRejectedValue(new Error('shutdown failed')),
    };
    const analytics = new AnalyticsService({ provider, analyticsLogger });

    expect(analytics.track({
      userId: 7,
      event: 'chat_message_sent',
    })).toBe(false);
    await expect(analytics.shutdown()).resolves.toBeUndefined();

    expect(analyticsLogger.warn).toHaveBeenNthCalledWith(
      1,
      'Analytics event delivery failed',
      { event: 'chat_message_sent' }
    );
    expect(analyticsLogger.warn).toHaveBeenNthCalledWith(2, 'Analytics shutdown failed');
  });

  it('allows the core operation to complete when event delivery fails', () => {
    const analytics = new AnalyticsService({
      provider: {
        capture: jest.fn(() => {
          throw new Error('PostHog unavailable');
        }),
      },
      analyticsLogger: {
        warn: jest.fn(),
      },
    });
    const completeReservation = () => {
      const reservation = {
        id: 42,
        status: 'confirmed',
      };

      analytics.track({
        userId: 7,
        event: 'reservation_completed',
        properties: {
          tourId: 3,
          participants: 2,
        },
      });

      return reservation;
    };

    expect(completeReservation()).toEqual({
      id: 42,
      status: 'confirmed',
    });
  });
});
