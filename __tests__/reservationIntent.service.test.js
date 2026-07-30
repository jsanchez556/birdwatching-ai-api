import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const {
  ReservationIntentExtractor,
  validateParsedIntent,
} = await import('../src/ai/services/reservationIntent.service.js');

function structuredIntent(overrides = {}) {
  return {
    intent: 'create_reservation',
    tourId: null,
    location: 'Monteverde',
    date: 'next Saturday',
    participants: 3,
    transportationRequired: null,
    pickupLocation: null,
    missingFields: ['transportationRequired'],
    confidence: 0.96,
    ...overrides,
  };
}

function completion(message) {
  return {
    id: 'completion-1',
    model: 'structured-model',
    choices: [{ message }],
  };
}

describe('reservation intent structured extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns stated booking details without inventing a tour ID', async () => {
    const client = {
      parseStructuredChatCompletion: jest.fn().mockResolvedValue(
        completion({ parsed: structuredIntent() })
      ),
    };
    const extractor = new ReservationIntentExtractor({ client, log: mockLogger });

    await expect(extractor.extract({
      message: 'Book the Monteverde tour for three people next Saturday.',
    })).resolves.toEqual({
      success: true,
      data: structuredIntent(),
    });
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        { role: 'user', content: 'Book the Monteverde tour for three people next Saturday.' },
      ]),
      expect.objectContaining({
        schemaName: 'reservation_intent',
        schema: expect.any(Object),
      })
    );
  });

  it('reports missing details for an incomplete request without fabrication', async () => {
    const parsed = structuredIntent({
      location: null,
      date: null,
      participants: null,
      missingFields: [
        'tourId',
        'location',
        'date',
        'participants',
        'transportationRequired',
      ],
      confidence: 0.88,
    });
    const extractor = new ReservationIntentExtractor({
      client: {
        parseStructuredChatCompletion: jest.fn().mockResolvedValue(completion({ parsed })),
      },
      log: mockLogger,
    });

    await expect(extractor.extract({
      message: 'I want to book a tour.',
    })).resolves.toEqual({ success: true, data: parsed });
  });

  it('accepts an ambiguous request only as an unknown, low-confidence intent', () => {
    const result = validateParsedIntent(structuredIntent({
      intent: 'unknown',
      location: null,
      date: 'tomorrow',
      participants: null,
      transportationRequired: null,
      missingFields: [],
      confidence: 0.18,
    }));

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        intent: 'unknown',
        tourId: null,
        location: null,
        participants: null,
        confidence: 0.18,
      }),
    });
  });

  it('preserves an explicit false transportation choice', () => {
    expect(validateParsedIntent(structuredIntent({
      transportationRequired: false,
      missingFields: [],
    }))).toEqual({
      success: true,
      data: expect.objectContaining({
        transportationRequired: false,
        pickupLocation: null,
      }),
    });
  });

  it('handles model refusal as a controlled terminal failure', async () => {
    const client = {
      parseStructuredChatCompletion: jest.fn().mockResolvedValue(
        completion({ refusal: 'Unable to comply.', parsed: null })
      ),
    };
    const extractor = new ReservationIntentExtractor({ client, log: mockLogger });

    await expect(extractor.extract({
      message: 'Book a tour.',
    })).resolves.toEqual({
      success: false,
      code: 'RESERVATION_INTENT_REFUSED',
      reason: 'model_refusal',
    });
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('retries once and returns a controlled failure for absent structured output', async () => {
    const client = {
      parseStructuredChatCompletion: jest.fn().mockResolvedValue(
        completion({ parsed: null })
      ),
    };
    const extractor = new ReservationIntentExtractor({ client, log: mockLogger });

    await expect(extractor.extract({
      message: 'Book a tour.',
    })).resolves.toMatchObject({
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
    });
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('does not retry terminal provider failures in the corrective schema loop', async () => {
    const client = {
      parseStructuredChatCompletion: jest.fn().mockRejectedValue(
        Object.assign(new Error('Invalid API key'), {
          status: 401,
          code: 'invalid_api_key',
        })
      ),
    };
    const extractor = new ReservationIntentExtractor({ client, log: mockLogger });

    await expect(extractor.extract({
      message: 'Book a tour.',
    })).resolves.toEqual({
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'structured_parse_failed',
    });
    expect(client.parseStructuredChatCompletion).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unknown fields', { extraField: 'not allowed' }],
    ['invalid intent enum', { intent: 'delete_reservation' }],
  ])('strictly rejects %s', (_label, override) => {
    expect(validateParsedIntent(structuredIntent(override))).toMatchObject({
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'schema_validation_failed',
    });
  });

  it('rejects missingFields entries that contradict supplied values', () => {
    expect(validateParsedIntent(structuredIntent({
      missingFields: ['participants', 'transportationRequired'],
    }))).toMatchObject({
      success: false,
      code: 'RESERVATION_INTENT_INVALID_OUTPUT',
      reason: 'inconsistent_missing_fields',
    });
  });
});
