import {
  computePositionRecency,
  computeSemanticRelevance,
  inferConversationSignals,
} from '../src/ai/context/conversationMessageSelector.js';

describe('intelligent conversation message scoring', () => {
  it('connects semantically related business concepts without exact wording', () => {
    const relevant = computeSemanticRelevance(
      'The reservation includes a vegetarian dinner.',
      'Book lunch with the tour.'
    );
    const acknowledgement = computeSemanticRelevance('Great, thanks.', 'Book lunch with the tour.');

    expect(relevant).toBeGreaterThan(acknowledgement);
  });

  it('makes recency a ranking signal without making it the only signal', () => {
    expect(computePositionRecency(0, 20)).toBeLessThan(computePositionRecency(19, 20));
    expect(computePositionRecency(19, 20)).toBe(1);
  });

  it.each([
    ['Actually, use four participants instead.', 'explicit_correction'],
    ['I am allergic to peanuts.', 'safety_critical'],
    ['The reservation is confirmed with confirmation code BW-4.', 'confirmed_reservation'],
    ['We still need to confirm the pickup location.', 'unresolved_commitment'],
  ])('marks mandatory signal in %s', (content, expectedReason) => {
    const signals = inferConversationSignals({ role: 'user', content }, {
      currentRequest: 'Book lunch with the tour.',
      position: 0,
      totalMessages: 20,
    });

    expect(signals.preservationReasons).toContain(expectedReason);
  });

  it('accepts explicit upstream scores for signals that text alone cannot establish', () => {
    const signals = inferConversationSignals({
      role: 'assistant',
      content: 'The selected option is number 8.',
      contextSignals: {
        semanticRelevance: 0.8,
        businessImportance: 0.9,
        unresolvedStatus: 0.7,
        confirmedReservation: true,
      },
    }, {
      currentRequest: 'Continue planning.',
      position: 0,
      totalMessages: 10,
    });

    expect(signals.contextScore).toBeCloseTo(0.665);
    expect(signals.preservationReasons).toContain('confirmed_reservation');
  });
});
