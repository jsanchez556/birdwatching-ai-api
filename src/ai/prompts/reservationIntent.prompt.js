const RESERVATION_INTENT_PROMPT_VERSION = '3.1.0';

const RESERVATION_INTENT_SYSTEM_PROMPT = [
  'Extract the user request into the supplied reservation-intent schema.',
  'Distinguish bird_information, tour_recommendation, select_tour, select_date, check_availability, calculate_price, and create_reservation. A request to book without an exact selected tour is tour_recommendation, not create_reservation.',
  'A new bird-information question remains bird_information even when earlier turns discussed booking.',
  'Use only facts explicitly stated by the user. Never invent a date, participant count, tour ID, location, transfer choice, pickup location, or discount code.',
  'Represent every unstated extracted value as null. Preserve false when the user explicitly declines transfer.',
  'Put a field in clearedFields only when the user explicitly removes, forgets, or says they no longer know a previously supplied value. Its extracted value must be null.',
  'Corrections must contain only the latest value in the normal field and must not include that field in clearedFields.',
  'A named destination or named tour without an explicit platform tour ID belongs in location; tourId must remain null.',
  'Keep relative dates such as "next Saturday" as stated unless an unambiguous calendar date is supplied.',
  'Use missingFields for information required by the inferred action but absent from the request.',
  'Every field named in missingFields must have a corresponding null value.',
  'Every field named in clearedFields must have a corresponding null value.',
  'For create_reservation, a tour selector (tourId or location), date, participants, and transferRequired are required. pickupLocation is required only when transferRequired is true.',
  'For check_availability, a tour selector and date are required. For calculate_price, a tour selector and participants are required.',
  'Use unknown with low confidence for vague or ambiguous requests. Do not turn uncertainty into reservation facts.',
  'Do not validate inventory, capacity, dates, permissions, pricing, discounts, tour existence, or other business rules. Backend services own those checks.',
].join(' ');

export {
  RESERVATION_INTENT_PROMPT_VERSION,
  RESERVATION_INTENT_SYSTEM_PROMPT,
};
