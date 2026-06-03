import { normalizeTextOrEmpty } from '../../utils/normalizers.js';

const TOUR_KEYWORDS = [
  'tour',
  'birdwatching',
  'bird watching',
  'quetzal',
  'monteverde',
  'tortuguero',
  'sarapiqui',
  'cerro de la muerte',
  'savegre',
  'bijagua',
  'upala',
  'tenorio',
  'rio celeste',
  'río celeste',
];

const BOOKING_KEYWORDS = ['book', 'reserve', 'reservation'];
const CONFIRMATION_KEYWORDS = [
  'confirm',
  'confirmed',
  'yes book',
  'yes reserve',
  'go ahead',
  'please book',
  'create the reservation',
];

function getPriorUserMessage(messages = []) {
  const userMessages = messages
    .filter((message) => message?.role === 'user')
    .map((message) => normalizeTextOrEmpty(message.content))
    .filter(Boolean);

  return userMessages.length > 1 ? userMessages[userMessages.length - 2] : '';
}

function getLastAssistantMessage(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === 'assistant')?.content || '';
}

function getRecentUserMessages(messages = []) {
  return [...messages]
    .reverse()
    .filter((message) => message?.role === 'user')
    .map((message) => normalizeTextOrEmpty(message.content))
    .filter(Boolean);
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractParticipants(text) {
  const match = text.match(/\b(?:for|we are|group of|party of|spots? for|reserve)\s+(\d{1,2})\b/i)
    || text.match(/\b(\d{1,2})\s+(?:people|persons|participants|guests|spots?)\b/i);

  return match ? Number(match[1]) : undefined;
}

function isAffirmativeConfirmation(text, context = {}) {
  const action = context.recentMetadata?.uiAction;
  const hasConfirmAction = ['choice', 'reservation_confirmation'].includes(action?.type)
    && Array.isArray(action.options)
    && action.options.some((option) => option.value === 'confirm_reservation');

  return Boolean(
    hasConfirmAction
      && /^(yes|yeah|yep|sure|ok|okay|confirm|please confirm|yes book it|yes,? book it|go ahead|proceed)$/i
        .test(normalizeTextOrEmpty(text))
  );
}

function extractParticipantActionSelection(text, context = {}) {
  const action = context.recentMetadata?.uiAction;
  const match = normalizeTextOrEmpty(text).match(/^\d{1,2}$/);

  if (action?.type !== 'participant_count' || !match) {
    return undefined;
  }

  const selectedCount = Number(match[0]);
  const min = Number(action.min || 1);
  const max = Number(action.max);

  if (Number.isFinite(max) && selectedCount > max) {
    return undefined;
  }

  return selectedCount >= min ? selectedCount : undefined;
}

function extractTourId(text) {
  const match = text.match(/\btour\s*#?\s*(\d+)\b/i)
    || text.match(/\bID\s*#?\s*(\d+)\b/i)
    || text.match(/\bI choose tour\s+(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractTourSelectionText(message) {
  const match = normalizeTextOrEmpty(message).match(/\b(?:i choose|select|pick|book|reserve)\s+(?:tour\s+\d+\s*:?\s*)?(.+)$/i);
  return match?.[1]?.trim();
}

function extractCustomerName(message) {
  const match = message.match(/\b(?:my name is|name is|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  return match?.[1];
}

function extractEmail(text) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractLocation(text) {
  if (/monteverde/i.test(text)) return 'Monteverde';
  if (/tortuguero/i.test(text)) return 'Tortuguero';
  if (/sarapiqui/i.test(text)) return 'Sarapiqui';
  if (/cerro de la muerte|savegre/i.test(text)) return 'Cerro de la Muerte';
  if (/bijagua|upala|tenorio|r[ií]o celeste/i.test(text)) return 'Tenorio-Bijagua and Rio Celeste';
  return undefined;
}

function normalizeForMatch(value) {
  return normalizeTextOrEmpty(value).toLowerCase().replace(/[_-]+/g, ' ');
}

function extractTransportationSelection(message, context = {}) {
  const normalized = normalizeForMatch(message);
  const action = context.recentMetadata?.uiAction;

  if (action?.type === 'transportation_selection' && Array.isArray(action.options)) {
    const selectedOption = action.options.find((option) => {
      const optionValue = option.value?.transportationOption;
      const candidates = [
        option.label,
        optionValue,
        optionValue?.replace(/_/g, ' '),
      ].map(normalizeForMatch).filter(Boolean);

      return candidates.some((candidate) => normalized.includes(candidate));
    });

    if (selectedOption?.value?.transportationOption) {
      return compactArgs({
        ...selectedOption.value,
        label: selectedOption.value.label || selectedOption.label,
        pricePerPerson: selectedOption.value.pricePerPerson,
        totalPrice: selectedOption.value.totalPrice,
        currency: selectedOption.value.currency,
        estimatedTravelTime: selectedOption.value.estimatedTravelTime,
      });
    }
  }

  const transportationOption = /shared shuttle/i.test(message)
    ? 'shared_shuttle'
    : /private transfer/i.test(message)
      ? 'private_transfer'
      : undefined;

  if (!transportationOption) {
    return undefined;
  }

  return compactArgs({
    transportationOption,
    origin: /san jos[eé]/i.test(message) ? 'San Jose' : undefined,
    destination: extractLocation(message),
  });
}

function extractTransportationDecline(message) {
  return /\b(no transportation|no transport|own car|drive myself|driving myself|i'?ll drive|do not need (?:transport|transportation)|don'?t need (?:transport|transportation)|have my own (?:transport|transportation))\b/i
    .test(normalizeTextOrEmpty(message));
}

function hasTransportationPreference(context = {}) {
  return Boolean(
    context.selectedTransportation
      || context.transportationDeclined
      || context.recentMetadata?.selectedTransportation
      || context.recentMetadata?.transportationDeclined
      || extractFromRecentUserMessages(context.messages, extractTransportationDecline)
  );
}

function hasTransportationRequest(context = {}) {
  const recentTransportationRequest = getRecentUserMessages(context.messages).some((message) => (
    /\b(transport|transportation|transfer|shuttle|pickup)\b/i.test(message)
      && !extractTransportationDecline(message)
  ));

  return Boolean(
    context.requestedTransportation
      || context.recentMetadata?.requestedTransportation
      || recentTransportationRequest
  );
}

function extractFromRecentUserMessages(messages = [], extractor) {
  for (const recentMessage of getRecentUserMessages(messages)) {
    const value = extractor(recentMessage);

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function extractBudget(text) {
  if (/\bbudget|cheap|affordable|low cost\b/i.test(text)) return 'budget';
  if (/\bluxury|premium|private\b/i.test(text)) return 'luxury';
  if (/\bmoderate|midrange|mid-range\b/i.test(text)) return 'moderate';
  return undefined;
}

function extractDifficulty(text) {
  if (/\beasy|beginner|accessible\b/i.test(text)) return 'easy';
  if (/\bchallenging|hard|strenuous\b/i.test(text)) return 'challenging';
  if (/\bmoderate\b/i.test(text)) return 'moderate';
  return undefined;
}

function extractDiscountCode(message) {
  const match = message.match(/\b(?:code|discount)\s+([A-Z0-9_-]{3,20})\b/i);
  return match?.[1]?.toUpperCase();
}

function hasSelectedTour(context = {}) {
  return Boolean(
    context.selectedTourId
      || context.selectedTour?.tourId
      || context.tourId
      || context.recentMetadata?.selectedTourId
      || context.recentMetadata?.selectedTour?.tourId
  );
}

function hasTourSelector(args = {}) {
  return Boolean(args.tourId || args.tourName || args.location);
}

function hasTransportationSelector(args = {}) {
  return Boolean(args.destination || args.location || args.tourName);
}

function buildBaseArgs(context = {}, extracted = {}) {
  const customerContext = context.customerContext
    || context.recentMetadata?.customerContext
    || {};
  const selectedTour = context.selectedTour || context.recentMetadata?.selectedTour || {};
  const contextParticipants = context.participants
    || context.recentMetadata?.participants
    || extractFromRecentUserMessages(context.messages, extractParticipants);
  const contextLocation = context.location
    || selectedTour.location
    || extractFromRecentUserMessages(context.messages, extractLocation);

  return {
    tourId: extracted.tourId || context.selectedTourId || selectedTour.tourId || context.recentMetadata?.selectedTourId || context.tourId,
    tourName: selectedTour.name || context.tourName,
    location: extracted.location || selectedTour.location || contextLocation,
    participants: extracted.participants || contextParticipants,
    discountCode: extracted.discountCode || context.discountCode,
    customerName: customerContext.customerName,
    customerEmail: customerContext.customerEmail,
    itineraryStartDate: customerContext.itineraryStartDate,
    itineraryEndDate: customerContext.itineraryEndDate,
  };
}

function compactArgs(args) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function hasRequiredReservationDetails(args) {
  return Boolean(
    (args.tourId || args.tourName || args.location)
      && args.participants
      && args.customerName
      && args.customerEmail
      && args.itineraryStartDate
      && args.itineraryEndDate
  );
}

function parseGuidedIntent(message, context = {}) {
  const normalized = normalizeTextOrEmpty(message).toLowerCase();

  if (/^show_transportation$|^show transportation$|^yes,? show transportation$|^yes transportation$|^i need transportation$|^i need a shuttle$/.test(normalized)) {
    return { intent: 'show_transportation' };
  }

  if (/^decline_transportation$|^decline transportation$|^no,? i have my own transportation$/.test(normalized) || extractTransportationDecline(message)) {
    return { intent: 'decline_transportation' };
  }

  if (/^i choose .*(shared shuttle|private transfer)/i.test(normalizeTextOrEmpty(message))) {
    return { intent: 'select_transportation' };
  }

  if (/^show me details$|^show details$|^details$|^more details$/.test(normalized)) {
    return { intent: 'show_details' };
  }

  if (/^proceed with booking$|^book this$|^continue booking$/.test(normalized)) {
    return { intent: 'proceed_booking' };
  }

  if (/^confirm_reservation$|^confirm reservation$|^confirm booking$/.test(normalized) || isAffirmativeConfirmation(message, context)) {
    return { intent: 'confirm_reservation' };
  }

  if (/^cancel_reservation$|^no thanks$|^no thank you$|^decline$/.test(normalized)) {
    return { intent: 'decline' };
  }

  const selectionId = extractTourId(message);

  if (selectionId && /^i choose tour\b/i.test(normalizeTextOrEmpty(message))) {
    return { intent: 'select_tour', tourId: selectionId };
  }

  const selectedTourText = extractTourSelectionText(message);

  if (selectedTourText && /^i choose\b|^select\b|^pick\b/i.test(normalizeTextOrEmpty(message))) {
    return { intent: 'select_tour', tourName: selectedTourText };
  }

  return null;
}

function findRecentTour(context = {}, tourId, selectedText) {
  const recentTours = Array.isArray(context.recentTours) ? context.recentTours : [];

  if (tourId) {
    return recentTours.find((tour) => tour.tourId === tourId);
  }

  if (selectedText) {
    const selection = normalizeForMatch(selectedText);
    const selectionTokens = selection.split(/\s+/).filter((token) => token.length > 2);
    const matchedTour = recentTours.find((tour) => {
      const tourText = normalizeForMatch([tour.name, tour.location].filter(Boolean).join(' '));
      return tourText.includes(selection)
        || (selectionTokens.length > 0 && selectionTokens.every((token) => tourText.includes(token)));
    });

    if (matchedTour) {
      return matchedTour;
    }
  }

  return recentTours.length === 1 ? recentTours[0] : null;
}

function isAffirmativeDetailsRequest(text, context = {}) {
  const lastAssistant = normalizeTextOrEmpty(getLastAssistantMessage(context.messages)).toLowerCase();
  const priorUserMessage = normalizeTextOrEmpty(getPriorUserMessage(context.messages));
  const isAffirmative = /^(yes|yeah|yep|sure|ok|okay|please|sounds good|tell me more|more details|details)$/i
    .test(normalizeTextOrEmpty(text));

  return Boolean(
    isAffirmative
      && priorUserMessage
      && /details|more|which tour|interests/i.test(lastAssistant)
  );
}

export class ToolPlanner {
  plan({ message, context = {} } = {}) {
    const originalMessage = normalizeTextOrEmpty(message);
    const guidedIntent = parseGuidedIntent(originalMessage, context);
    const detailsFollowUp = guidedIntent?.intent === 'show_details'
      || isAffirmativeDetailsRequest(originalMessage, context);
    const planningMessage = detailsFollowUp || guidedIntent?.intent === 'proceed_booking'
      ? getPriorUserMessage(context.messages)
      : originalMessage;
    const text = normalizeTextOrEmpty(planningMessage).toLowerCase();
    const extracted = {
      participants: extractParticipants(planningMessage)
        || extractParticipantActionSelection(originalMessage, context),
      tourId: extractTourId(planningMessage),
      customerName: extractCustomerName(planningMessage),
      customerEmail: extractEmail(planningMessage),
      location: extractLocation(planningMessage),
      budget: extractBudget(planningMessage),
      difficulty: extractDifficulty(planningMessage),
      discountCode: extractDiscountCode(planningMessage),
    };
    const baseArgs = buildBaseArgs(context, extracted);
    const args = compactArgs({
      ...baseArgs,
      customerName: baseArgs.customerName || extracted.customerName || context.customerName,
      customerEmail: baseArgs.customerEmail || extracted.customerEmail || context.customerEmail,
    });
    const recentTour = findRecentTour(
      context,
      guidedIntent?.tourId || extracted.tourId,
      guidedIntent?.tourName || extractTourSelectionText(originalMessage)
    );
    const selectedArgs = compactArgs({
      ...args,
      tourId: recentTour?.tourId || guidedIntent?.tourId || args.tourId,
      tourName: recentTour?.name || guidedIntent?.tourName || args.tourName,
      location: recentTour?.location || args.location,
    });
    const selectedTransportation = extractTransportationSelection(originalMessage, context)
      || context.selectedTransportation
      || context.recentMetadata?.selectedTransportation;
    const transportationDeclined = guidedIntent?.intent === 'decline_transportation'
      || context.transportationDeclined
      || context.recentMetadata?.transportationDeclined
      || extractTransportationDecline(originalMessage)
      || extractFromRecentUserMessages(context.messages, extractTransportationDecline);

    const asksForBooking = includesAny(text, BOOKING_KEYWORDS);
    const confirmsBooking = includesAny(text, CONFIRMATION_KEYWORDS) || context.confirmedReservation === true;
    const asksForPrice = /\b(price|pricing|cost|total|how much|quote|discount)\b/i.test(planningMessage);
    const asksForAvailability = /\b(available|availability|slots?|space)\b/i.test(planningMessage);
    const asksForTransportation = /\b(transport|transportation|transfer|shuttle|pickup|drive|travel time|full cost)\b/i.test(planningMessage);
    const asksForTour = /\b(tour|birdwatching|bird watching)\b/i.test(planningMessage)
      || includesAny(text, TOUR_KEYWORDS);
    const asksForRecommendation = /\b(recommend|suggest|best|options?|available tours?|show me|find)\b/i.test(planningMessage)
      || includesAny(text, TOUR_KEYWORDS);
    const needsTourDiscovery = !hasSelectedTour(context) && !selectedArgs.tourId && !selectedArgs.tourName;
    const asksForTransportationAndBooking = asksForTransportation && asksForBooking;
    const selectedParticipantCount = extractParticipantActionSelection(originalMessage, context);
    const transportationPreferenceKnown = hasTransportationPreference({
      ...context,
      selectedTransportation,
      transportationDeclined,
    });
    const transportationRequested = hasTransportationRequest(context) || asksForTransportation;

    if (selectedParticipantCount && hasSelectedTour(context)) {
      if (!hasRequiredReservationDetails(selectedArgs)) {
        return {
          status: 'needs_clarification',
          message: 'Use the selected participant count and ask only for any missing booking details before creating the reservation.',
          steps: [{ tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false }],
        };
      }

      if (!transportationPreferenceKnown) {
        return {
          status: 'needs_transportation_preference',
          message: 'The user selected the participant count. Ask whether they would like transportation before final reservation confirmation.',
          steps: [
            { tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false },
            { tool: 'calculatePricing', args: selectedArgs, stopOnFailure: false },
          ],
        };
      }

      return {
        status: 'needs_confirmation',
        transportationDeclined,
        message: 'The user selected the participant count and transportation preference is known. Ask for final reservation confirmation before creating the reservation.',
        steps: [
          { tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false },
          { tool: 'calculatePricing', args: selectedArgs, stopOnFailure: false },
        ],
      };
    }

    if (guidedIntent?.intent === 'show_transportation') {
      return {
        status: 'transportation_requested',
        message: 'The user wants transportation options. Calculate transportation and show the transportation selection action while preserving the selected tour and booking details.',
        steps: [{ tool: 'calculateTransportation', args: selectedArgs, stopOnFailure: false }],
      };
    }

    if (guidedIntent?.intent === 'decline_transportation') {
      return {
        status: 'transportation_declined',
        transportationDeclined: true,
        message: hasRequiredReservationDetails(selectedArgs)
          ? 'The user declined transportation. Preserve that preference and ask for final reservation confirmation.'
          : 'The user declined transportation. Preserve that preference and ask only for missing booking details.',
        steps: hasTourSelector(selectedArgs)
          ? [
            { tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false },
            ...(selectedArgs.participants ? [{ tool: 'calculatePricing', args: selectedArgs, stopOnFailure: false }] : []),
          ]
          : [],
      };
    }

    if (guidedIntent?.intent === 'select_transportation' && selectedTransportation) {
      const steps = hasTourSelector(selectedArgs)
        ? [
          { tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false },
          ...(selectedArgs.participants ? [{ tool: 'calculatePricing', args: selectedArgs, stopOnFailure: false }] : []),
        ]
        : [];

      return {
        status: 'transportation_selected',
        selectedTransportation,
        message: selectedArgs.participants
          ? 'The user selected a transportation option. Persist selectedTransportation, do not show the transportation selection action again, use customerContext for customer details and itinerary dates, and ask only for final reservation confirmation if tour availability and pricing are available.'
          : 'The user selected a transportation option. Persist selectedTransportation, do not show the transportation selection action again, use customerContext for customer details and itinerary dates, and ask only for missing booking details.',
        steps,
      };
    }

    if (asksForTransportationAndBooking) {
      const steps = [];

      if (needsTourDiscovery) {
        steps.push({
          tool: 'searchTours',
          args: compactArgs({
            location: selectedArgs.location || context.location,
            budget: extracted.budget || context.budget,
            difficulty: extracted.difficulty || context.difficulty,
            participants: selectedArgs.participants || context.participants,
            query: planningMessage,
            recommend: true,
            limit: 3,
          }),
          stopOnFailure: false,
        });
      }

      steps.push({
        tool: 'calculateTransportation',
        args: selectedArgs,
        stopOnFailure: false,
      });

      if (hasTourSelector(selectedArgs)) {
        steps.push({
          tool: 'checkAvailability',
          args: selectedArgs,
          stopOnFailure: false,
        });
      }

      return {
        status: 'needs_clarification',
        message: 'The user needs transportation and a reservation. Execute available discovery/logistics steps, then let them choose a transportation option before reservation confirmation.',
        steps,
      };
    }

    if (guidedIntent?.intent === 'decline') {
      return {
        status: 'declined',
        message: 'Acknowledge the user declined and ask what else they would like help with.',
        steps: [],
      };
    }

    if (detailsFollowUp && recentTour) {
      const steps = [{
        tool: 'checkAvailability',
        args: selectedArgs,
        stopOnFailure: false,
      }];

      if (asksForTransportation) {
        steps.push({
          tool: 'calculateTransportation',
          args: selectedArgs,
          stopOnFailure: false,
        });
      }

      return {
        status: 'show_details',
        message: `The user asked for details about the previously found ${recentTour.name}. Show that tour's details now. Do not search for alternatives unless this tool result fails. Do not say you could not find the previous tour.`,
        steps,
      };
    }

    if (detailsFollowUp) {
      return {
        status: 'show_details',
        message: 'The user asked for details but no recent tour metadata is available. Ask them to choose a tour from the available options.',
        steps: [],
      };
    }

    if (guidedIntent?.intent === 'select_tour' || guidedIntent?.intent === 'proceed_booking') {
      const actionArgs = selectedArgs;

      if (actionArgs.participants && transportationRequested && !transportationPreferenceKnown) {
        return {
          status: 'transportation_requested',
          requestedTransportation: true,
          message: 'The user selected a tour after requesting transportation. Check availability and show transportation options before pricing or final reservation confirmation.',
          steps: [
            { tool: 'checkAvailability', args: actionArgs, stopOnFailure: false },
            { tool: 'calculateTransportation', args: actionArgs, stopOnFailure: false },
          ],
        };
      }

      return {
        status: guidedIntent.intent,
        message: actionArgs.participants
          ? 'The user selected a tour and provided participant count. Use customerContext for name, email, and itinerary dates. Ask only for final confirmation if pricing and availability are available.'
          : 'The user selected a tour. Customer name, email, and itinerary dates are already available from customerContext when present. Ask only for the missing participant count.',
        steps: [
          { tool: 'checkAvailability', args: actionArgs, stopOnFailure: false },
          ...(actionArgs.participants ? [{ tool: 'calculatePricing', args: actionArgs, stopOnFailure: false }] : []),
        ],
      };
    }

    if (guidedIntent?.intent === 'confirm_reservation') {
      if (!hasRequiredReservationDetails(selectedArgs)) {
        return {
          status: 'needs_clarification',
          message: 'Ask only for the missing booking details. Do not ask again for customer name, email, or itinerary dates if they exist in customerContext.',
          steps: selectedArgs.tourId
            ? [{ tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false }]
            : [],
        };
      }

      if (!transportationPreferenceKnown) {
        return {
          status: 'needs_transportation_preference',
          message: 'Ask whether the user would like transportation before creating the reservation.',
          steps: [
            { tool: 'checkAvailability', args: selectedArgs, stopOnFailure: false },
            { tool: 'calculatePricing', args: selectedArgs, stopOnFailure: false },
          ],
        };
      }

      return {
        status: 'ready',
        transportationDeclined,
        steps: [
          { tool: 'checkAvailability', args: selectedArgs },
          { tool: 'calculatePricing', args: selectedArgs },
          { tool: 'createReservation', args: selectedArgs },
        ],
      };
    }

    if (asksForBooking && confirmsBooking) {
      if (!hasRequiredReservationDetails(args)) {
        return {
          status: 'needs_clarification',
          message: 'Ask only for missing booking details before creating the reservation. Use customerContext for customer name, customer email, and itinerary dates when available, and use the conversation history for participant count when the user already provided it.',
          steps: [],
        };
      }

      if (!transportationPreferenceKnown) {
        return {
          status: 'needs_transportation_preference',
          message: 'Ask whether the user would like transportation before creating the reservation.',
          steps: [
            { tool: 'checkAvailability', args, stopOnFailure: false },
            { tool: 'calculatePricing', args, stopOnFailure: false },
          ],
        };
      }

      return {
        status: 'ready',
        transportationDeclined,
        steps: [
          { tool: 'checkAvailability', args },
          { tool: 'calculatePricing', args },
          { tool: 'createReservation', args },
        ],
      };
    }

    if (asksForBooking) {
      return {
        status: 'needs_confirmation',
        message: 'I can help book that. Ask only for missing booking details, then ask for final booking confirmation. Use customerContext for customer name, customer email, and itinerary dates when available, and do not ask again for participant count when it was already provided earlier in the conversation.',
        steps: hasSelectedTour(context) || args.tourId || args.tourName || args.location
          ? [
            { tool: 'checkAvailability', args, stopOnFailure: false },
            ...(args.participants ? [{ tool: 'calculatePricing', args, stopOnFailure: false }] : []),
          ]
          : [],
      };
    }

    if (asksForTransportation && asksForPrice) {
      if (!hasTourSelector(args)) {
        return {
          status: 'needs_clarification',
          message: 'Ask which tour or destination they want a full cost for before calculating transportation and pricing.',
          steps: args.location
            ? [{ tool: 'searchTours', args: compactArgs({ location: args.location, participants: args.participants, recommend: true }), stopOnFailure: false }]
            : [],
        };
      }

      if (!args.participants) {
        return {
          status: 'needs_clarification',
          message: 'Ask how many people should be included before calculating the full cost.',
          steps: [],
        };
      }

      const planSteps = [];

      if (!hasSelectedTour(context) && !args.tourId && !args.tourName && args.location) {
        planSteps.push({
          tool: 'searchTours',
          args: compactArgs({
            location: args.location,
            participants: args.participants,
            budget: extracted.budget,
            difficulty: extracted.difficulty,
            query: planningMessage,
            recommend: true,
          }),
          stopOnFailure: false,
        });
      }

      planSteps.push(
        { tool: 'calculateTransportation', args, stopOnFailure: false },
        { tool: 'calculatePricing', args, stopOnFailure: false }
      );

      return {
        status: 'ready',
        steps: planSteps,
      };
    }

    if (asksForTransportation && asksForTour) {
      const searchArgs = compactArgs({
        location: extracted.location || context.location,
        budget: extracted.budget || context.budget,
        difficulty: extracted.difficulty || context.difficulty,
        participants: extracted.participants || context.participants,
        query: planningMessage,
        recommend: true,
        limit: 3,
      });
      const steps = [{
        tool: 'searchTours',
        args: searchArgs,
        stopOnFailure: false,
      }];

      if (hasTransportationSelector(args)) {
        steps.push({ tool: 'calculateTransportation', args, stopOnFailure: false });
      }

      return {
        status: hasTransportationSelector(args) ? 'ready' : 'needs_clarification',
        message: hasTransportationSelector(args)
          ? undefined
          : 'Show matching tours first, then ask which tour or destination they want transportation for.',
        steps,
      };
    }

    if (asksForTransportation) {
      if (!hasTransportationSelector(args)) {
        return {
          status: 'needs_clarification',
          message: 'Ask which tour or destination they need transportation for before calculating transportation.',
          steps: [],
        };
      }

      return {
        status: 'ready',
        steps: [{ tool: 'calculateTransportation', args }],
      };
    }

    if (asksForPrice) {
      if (!hasTourSelector(args)) {
        return {
          status: 'needs_clarification',
          message: 'Ask which tour they want pricing for before calculating a price.',
          steps: [],
        };
      }

      if (!args.participants) {
        return {
          status: 'needs_clarification',
          message: 'How many people should I price the tour for?',
          steps: [],
        };
      }

      return {
        status: 'ready',
        steps: [{ tool: 'calculatePricing', args }],
      };
    }

    if (asksForAvailability) {
      if (!hasTourSelector(args)) {
        return {
          status: 'needs_clarification',
          message: 'Ask which tour they want to check availability for.',
          steps: [],
        };
      }

      return {
        status: 'ready',
        steps: [{ tool: 'checkAvailability', args }],
      };
    }

    if (asksForRecommendation) {
      return {
        status: 'ready',
        steps: [{
          tool: 'searchTours',
          args: compactArgs({
            location: extracted.location || context.location,
            budget: extracted.budget || context.budget,
            difficulty: extracted.difficulty || context.difficulty,
            participants: extracted.participants || context.participants,
            query: planningMessage,
            recommend: /\b(recommend|suggest|best)\b/i.test(planningMessage),
            limit: 3,
          }),
        }],
      };
    }

    return {
      status: 'no_tools',
      steps: [],
    };
  }
}

export default new ToolPlanner();
