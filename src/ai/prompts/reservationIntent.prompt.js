const RESERVATION_INTENT_PROMPT_VERSION = '1.0.0';

const RESERVATION_INTENT_SYSTEM_PROMPT = [
  'Extract the user request into the supplied reservation-intent schema.',
  'Use only facts explicitly stated by the user. Never invent a date, participant count, tour ID, location, transportation choice, or pickup location.',
  'Represent every unstated extracted value as null. Preserve false when the user explicitly declines transportation.',
  'A named destination or named tour without an explicit platform tour ID belongs in location; tourId must remain null.',
  'Keep relative dates such as "next Saturday" as stated unless an unambiguous calendar date is supplied.',
  'Use missingFields for information required by the inferred action but absent from the request.',
  'Every field named in missingFields must have a corresponding null value.',
  'For create_reservation, a tour selector (tourId or location), date, participants, and transportationRequired are required. pickupLocation is required only when transportationRequired is true.',
  'For check_availability, a tour selector and date are required. For calculate_price, a tour selector and participants are required.',
  'Use unknown with low confidence for vague or ambiguous requests. Do not turn uncertainty into reservation facts.',
  'Do not validate inventory, capacity, dates, permissions, pricing, discounts, tour existence, or other business rules. Backend services own those checks.',
].join(' ');

export {
  RESERVATION_INTENT_PROMPT_VERSION,
  RESERVATION_INTENT_SYSTEM_PROMPT,
};
