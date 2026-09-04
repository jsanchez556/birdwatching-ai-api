import { DEFAULT_CURRENCY, TRANSFER_LABELS } from '../../constants/business.js';

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

function enumerateItineraryDates(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return [];
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end && dates.length < 367) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function buildDateSelectionAction(result = {}, metadata = {}) {
  const occurrenceDates = (result.availableDates || []).map((item) => item.date).filter(Boolean);
  const flexibleDates = enumerateItineraryDates(
    metadata.customerContext?.itineraryStartDate,
    metadata.customerContext?.itineraryEndDate
  );
  return {
    type: 'date_picker',
    tourId: result.tourId,
    prompt: `Choose a date for ${result.name}.`,
    availableDates: result.tourType === 'scheduled' ? occurrenceDates : flexibleDates,
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

function buildTransferPreferenceAction() {
  return {
    type: 'choice',
    prompt: 'Would you like a transfer for this tour?',
    options: toOptions([
      ['Yes, show transfer options', 'show_transfer'],
      ['No, I do not need a transfer', 'decline_transfer'],
    ]),
  };
}

function getReservationValues(metadata = {}, args = {}) {
  const state = metadata.reservationState || {};
  return {
    ...(state.confirmed || {}),
    ...(state.proposed || {}),
    ...args,
  };
}

function buildReservationDetailsAction(result = {}, metadata = {}, args = {}) {
  const values = getReservationValues(metadata, args);
  const customerContext = metadata.customerContext || {};
  const participantAction = buildParticipantCountAction(result.maxParticipants || result.availableSlots);
  const dateAction = buildDateSelectionAction(result, metadata);
  const transferKnown = values.transferRequired !== undefined
    || Boolean(metadata.selectedTransfer || metadata.transferDeclined);
  const fields = [];

  if (result.requiresDateSelection && !values.date) {
    fields.push({
      name: 'date',
      type: 'date',
      label: dateAction.prompt,
      tourId: result.tourId,
      availableDates: dateAction.availableDates,
    });
  }
  if (!values.participants) {
    fields.push({
      name: 'participants',
      type: 'select',
      label: participantAction.prompt,
      min: participantAction.min,
      ...(participantAction.max ? { max: participantAction.max } : {}),
      options: participantAction.options || [],
    });
  }
  if (!transferKnown) {
    fields.push({
      name: 'transferRequired',
      type: 'select',
      label: 'Would you like a transfer for this tour?',
      options: toOptions([
        ['Yes, I need a transfer', true],
        ['No, I do not need a transfer', false],
      ]),
    });
  }
  if (values.transferRequired === true && !values.pickupLocation) {
    fields.push({
      name: 'pickupLocation',
      type: 'text',
      label: 'Pickup location',
    });
  } else if (!transferKnown) {
    fields.push({
      name: 'pickupLocation',
      type: 'text',
      label: 'Pickup location',
      requiredWhen: { field: 'transferRequired', equals: true },
    });
  }

  const customerFields = [
    ['customerName', 'text', 'Full name'],
    ['customerEmail', 'email', 'Email'],
    ['itineraryStartDate', 'date', 'Itinerary start date'],
    ['itineraryEndDate', 'date', 'Itinerary end date'],
  ];
  customerFields.forEach(([name, type, label]) => {
    if (!values[name] && !customerContext[name]) fields.push({ name, type, label });
  });

  if (fields.length === 0) return null;
  if (fields.length === 1 && ['date', 'participants', 'transferRequired'].includes(fields[0].name)) {
    return null;
  }
  return {
    type: 'reservation_details',
    prompt: 'Please provide the remaining reservation details.',
    fields,
  };
}

function formatTransferType(type) {
  if (TRANSFER_LABELS[type]) return TRANSFER_LABELS[type];
  return type.split('_').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function buildTransferSelectionAction(result = {}) {
  if (!Array.isArray(result.options) || result.options.length === 0) return null;

  return {
    type: 'transfer_selection',
    prompt: `Which transfer option would you prefer for ${result.origin} to ${result.destination}?`,
    options: result.options.map((option) => {
      const label = formatTransferType(option.type);
      const currency = option.currency || DEFAULT_CURRENCY;
      const priceDetails = option.pricePerPerson
        ? `${currency} ${option.pricePerPerson} per person, ${currency} ${option.totalPrice} total`
        : `${currency} ${option.totalPrice} total`;
      return {
        label,
        value: {
          transferOption: option.type,
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
  const currency = result.currency || metadata.selectedTransfer?.currency || 'USD';
  const tourSubtotal = Number(result.totalPrice ?? result.total ?? result.subtotal);
  const transferTotal = Number(metadata.selectedTransfer?.totalPrice || 0);
  if (!Number.isFinite(tourSubtotal)) return null;

  return {
    tourSubtotal,
    ...(transferTotal > 0 ? { transferTotal } : {}),
    total: Number((tourSubtotal + (Number.isFinite(transferTotal) ? transferTotal : 0)).toFixed(2)),
    currency,
  };
}

export function appendToolResponseMetadata(metadata, toolName, result, args = {}) {
  if (!metadata || typeof metadata !== 'object') return;
  metadata.toolsCalled = [...(metadata.toolsCalled || []), toolName];

  if (toolName === 'searchTours' && args.recommend === true) {
    metadata.tourRecommendationRequested = true;
  }

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

  if (toolName === 'calculateTransfer' && result?.success) {
    metadata.uiAction = buildTransferSelectionAction(result);
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
      durationValue: result.durationValue,
      durationUnit: result.durationUnit,
      durationHours: result.durationHours,
      duration: result.duration,
      difficulty: result.difficulty,
      type: result.type,
      tourType: result.tourType,
      maxParticipants: result.maxParticipants,
      minimumPrice: result.minimumPrice,
      occurrenceDates: result.occurrenceDates,
    };
    metadata.selectedTourId = result.tourId;
    if ([
      'select_tour', 'proceed_booking', 'transfer_selected', 'transfer_declined',
      'needs_clarification', 'needs_confirmation', 'needs_transfer_preference',
    ].includes(metadata.agentPlan?.status)) {
      const combinedDetailsAction = buildReservationDetailsAction(result, metadata, args);
      const reservationValues = getReservationValues(metadata, args);
      const transferKnown = reservationValues.transferRequired !== undefined
        || Boolean(metadata.selectedTransfer || metadata.transferDeclined);
      const transferResolved = reservationValues.transferRequired === false
        || Boolean(metadata.selectedTransfer || metadata.transferDeclined);
      if (metadata.uiAction?.type !== 'transfer_selection') {
        if (combinedDetailsAction) metadata.uiAction = combinedDetailsAction;
        else if (result.requiresDateSelection && !reservationValues.date) metadata.uiAction = buildDateSelectionAction(result, metadata);
        else if (!reservationValues.participants) metadata.uiAction = buildParticipantCountAction(result.maxParticipants || result.availableSlots);
        else if (!transferKnown) metadata.uiAction = buildTransferPreferenceAction();
        else if (
          hasCompleteCustomerContext(metadata)
          && transferResolved
        ) metadata.uiAction = buildConfirmReservationAction();
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
