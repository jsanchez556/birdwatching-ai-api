import {
  UNAVAILABLE_CAPABILITIES,
  classifyCapabilityFailure,
  getDegradationMetadata,
  normalizeUnavailableCapabilities,
  withDegradationMetadata,
} from '../src/utils/degradation.utils.js';

describe('graceful degradation utilities', () => {
  it('returns healthy metadata when no capability failed', () => {
    expect(withDegradationMetadata({ answer: 'Available.' })).toEqual({
      answer: 'Available.',
      degradedMode: false,
      unavailableCapabilities: [],
    });
  });

  it('deduplicates capability identifiers in stable policy order', () => {
    expect(normalizeUnavailableCapabilities([
      UNAVAILABLE_CAPABILITIES.RESERVATION_TOOL,
      UNAVAILABLE_CAPABILITIES.RAG_RECOMMENDATIONS,
      UNAVAILABLE_CAPABILITIES.VOICE_SERVICE,
      UNAVAILABLE_CAPABILITIES.RESERVATION_TOOL,
      'unknown_capability',
      UNAVAILABLE_CAPABILITIES.ADVANCED_MODEL,
    ])).toEqual([
      'rag_recommendations',
      'advanced_model',
      'voice_service',
      'reservation_tool',
    ]);
  });

  it('merges every failed capability once', () => {
    expect(getDegradationMetadata(
      { unavailableCapabilities: ['image_analysis', 'rag_recommendations'] },
      { unavailableCapabilities: ['rag_recommendations', 'reservation_tool'] }
    )).toEqual({
      degradedMode: true,
      unavailableCapabilities: [
        'rag_recommendations',
        'image_analysis',
        'reservation_tool',
      ],
    });
  });

  it('does not classify ordinary client validation as infrastructure degradation', () => {
    expect(classifyCapabilityFailure({
      status: 422,
      code: 'VALIDATION_ERROR',
    })).toEqual({
      recoverable: false,
      classification: 'client_or_business_error',
    });
  });

  it('does not conceal an unexpected programming failure as degradation', () => {
    expect(classifyCapabilityFailure(new TypeError('unexpected code defect'))).toEqual({
      recoverable: false,
      classification: 'unexpected_failure',
    });
  });

  it.each([
    [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ code: 'ECONNREFUSED' }, 'connection_failure'],
    [{ code: 'provider_malformed_response' }, 'invalid_provider_response'],
    [{ code: 'CIRCUIT_OPEN' }, 'circuit_open'],
    [{ code: 'MISSING_CONFIGURATION' }, 'missing_configuration'],
  ])('classifies recoverable capability failures safely', (error, classification) => {
    expect(classifyCapabilityFailure(error)).toEqual({
      recoverable: true,
      classification,
    });
  });
});
