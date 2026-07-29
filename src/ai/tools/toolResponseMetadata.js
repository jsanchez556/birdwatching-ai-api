import { DEFAULT_CURRENCY, TRANSPORTATION_LABELS } from '../../constants/business.js';

const toOptions = (options) => options.map(([label, value]) => ({ label, value }));

function buildChoiceAction() {
  return {
    type: 'choice',
    prompt: 'What would you like to do next?',
    options: toOptions([
      ['Show me details', 'show_details'],
      ['Proceed with booking', 'proceed_booking'],
      ['No thanks', 'decline'],
    ]),
  };
}

function buildTourSelectionAction(tours = []) {
  return {
    type: 'tour_selection',
    prompt: 'Which tour are you interested in?',
    options: tours.map((tour) => ({
      label: tour.name,
      value: { tourId: tour.tourId, tourName: tour.name },
      description: `${tour.location} · $${tour.pricePerPerson} · ${tour.durationHours}h · ${tour.difficulty}`,
    })),
  };
}

function buildParticipantCountAction(max = null) {
  const maxCount = Number(max);
  const options = Number.isInteger(maxCount) && maxCount > 0
    ? Array.from({ length: maxCount }, (_, index) => ({ label: String(index + 1), value: index + 1 }))
    : [];
  return {
    type: 'participant_count',
    prompt: 'How many participants should I reserve?',
    min: 1,
    ...(maxCount > 0 ? { max: maxCount } : {}),
    ...(options.length ? { options } : {}),
  };
}

function buildConfirmReservationAction() {
  return {
    type: 'reservation_confirmation',
    prompt: 'Confirm this reservation?',
    options: toOptions([
      ['Confirm reservation', 'confirm_reservation'],
      ['Cancel', 'cancel_reservation'],
    ]),
  };
}

function buildTransportationPreferenceAction() {
  return {
    type: 'choice',
    prompt: 'Would you like transportation for this tour?',
    options: toOptions([
      ['Yes, show transportation', 'show_transportation'],
      ['No, I have my own transportation', 'decline_transportation'],
    ]),
  };
}

function formatTransportationType(type) {
  if (TRANSPORTATION_LABELS[type]) return TRANSPORTATION_LABELS[type];
  return type.split('_').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function buildTransportationSelectionAction(result = {}) {
  if (!Array.isArray(result.options) || result.options.length === 0) return null;

  return {
    type: 'transportation_selection',
    prompt: `Which transportation option would you prefer for ${result.origin} to ${result.destination}?`,
    options: result.options.map((option) => {
      const label = formatTransportationType(option.type);
      const currency = option.currency || DEFAULT_CURRENCY;
      const priceDetails = option.pricePerPerson
        ? `${currency} ${option.pricePerPerson} per person, ${currency} ${option.totalPrice} total`
        : `${currency} ${option.totalPrice} total`;
      return {
        label,
        value: {
          transportationOption: option.type,
          origin: result.origin,
          destination: result.destination,
          label,
          ...(option.pricePerPerson ? { pricePerPerson: option.pricePerPerson } : {}),
          totalPrice: option.totalPrice,
          currency: option.currency,
          estimatedTravelTime: result.estimatedTravelTime,
        },
        description: `${priceDetails} · ${result.estimatedTravelTime}`,
        recommended: option.type === result.recommendedOption,
      };
    }),
  };
}

function hasCompleteCustomerContext(metadata = {}) {
  const customerContext = metadata.customerContext || {};
  return ['customerName', 'customerEmail', 'itineraryStartDate', 'itineraryEndDate']
    .every((key) => customerContext[key]);
}

function buildPricingMetadata(result = {}, metadata = {}) {
  const currency = result.currency || metadata.selectedTransportation?.currency || 'USD';
  const tourSubtotal = Number(result.totalPrice ?? result.total ?? result.subtotal);
  const transportationTotal = Number(metadata.selectedTransportation?.totalPrice || 0);
  if (!Number.isFinite(tourSubtotal)) return null;

  return {
    tourSubtotal,
    ...(transportationTotal > 0 ? { transportationTotal } : {}),
    total: Number((tourSubtotal + (Number.isFinite(transportationTotal) ? transportationTotal : 0)).toFixed(2)),
    currency,
  };
}

export function appendToolResponseMetadata(metadata, toolName, result, args = {}) {
  if (!metadata || typeof metadata !== 'object') return;
  metadata.toolsCalled = [...(metadata.toolsCalled || []), toolName];

  if (args.participants) metadata.participants = Number(args.participants);
  else if (result?.participants) metadata.participants = Number(result.participants);

  if (Array.isArray(result?.tours)) {
    metadata.tours = result.tours;
    metadata.uiAction = result.tours.length === 0
      ? {
        type: 'choice',
        prompt: 'No matching tours were found. Would you like a human agent to contact you?',
        options: toOptions([['Contact me', 'contact_agent'], ['No thanks', 'decline']]),
      }
      : result.tours.length === 1 ? buildChoiceAction() : buildTourSelectionAction(result.tours);
  }

  if (toolName === 'calculateTransportation' && result?.success) {
    metadata.uiAction = buildTransportationSelectionAction(result);
  }
  if (result?.selectedTour) {
    metadata.selectedTour = result.selectedTour;
    metadata.selectedTourId = result.selectedTour.tourId;
  }
  if (toolName === 'checkAvailability' && result?.success && result?.tourId) {
    metadata.selectedTour = {
      tourId: result.tourId,
      name: result.name,
      location: result.location,
      pricePerPerson: result.pricePerPerson,
      availableSlots: result.availableSlots,
      durationHours: result.durationHours,
      difficulty: result.difficulty,
    };
    metadata.selectedTourId = result.tourId;
    if ([
      'select_tour', 'proceed_booking', 'transportation_selected', 'transportation_declined',
      'needs_clarification', 'needs_confirmation', 'needs_transportation_preference',
    ].includes(metadata.agentPlan?.status)) {
      if (!args.participants) metadata.uiAction = buildParticipantCountAction(result.availableSlots);
      else if (metadata.agentPlan?.status === 'needs_transportation_preference') {
        metadata.uiAction = buildTransportationPreferenceAction();
      } else if (
        hasCompleteCustomerContext(metadata)
        && (metadata.selectedTransportation || metadata.transportationDeclined)
        && metadata.uiAction?.type !== 'transportation_selection'
      ) {
        metadata.uiAction = buildConfirmReservationAction();
      }
    }
  }
  if (result?.tourId && ['checkAvailability', 'calculatePricing'].includes(toolName)) {
    metadata.selectedTourId ||= result.tourId;
  }
  if (result?.participants && ['calculatePricing', 'createReservation'].includes(toolName)) {
    metadata.participants = Number(result.participants);
  }
  if (toolName === 'calculatePricing' && result?.success) {
    const pricing = buildPricingMetadata(result, metadata);
    if (pricing) metadata.pricing = pricing;
  }
  if (result?.reservation) metadata.reservation = result.reservation;
  else if (toolName === 'createReservation' && result?.success) metadata.reservation = result;
}
