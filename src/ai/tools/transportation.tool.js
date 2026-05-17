const DEFAULT_CURRENCY = 'USD';

const transportationProfiles = [
  {
    matcher: /monteverde/i,
    destination: 'Monteverde',
    estimatedTravelTime: '3.5-4.5 hours from San Jose',
    sharedShuttleUsd: 65,
    privateTransferUsd: 220,
  },
  {
    matcher: /tortuguero/i,
    destination: 'Tortuguero',
    estimatedTravelTime: '4-5 hours from San Jose including boat transfer',
    sharedShuttleUsd: 85,
    privateTransferUsd: 290,
  },
  {
    matcher: /sarapiqui|sarapiqui/i,
    destination: 'Sarapiqui',
    estimatedTravelTime: '2-2.5 hours from San Jose',
    sharedShuttleUsd: 55,
    privateTransferUsd: 180,
  },
  {
    matcher: /cerro de la muerte|savegre/i,
    destination: 'Cerro de la Muerte',
    estimatedTravelTime: '2.5-3.5 hours from San Jose',
    sharedShuttleUsd: 60,
    privateTransferUsd: 200,
  },
];

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toPositiveInteger(value, fieldName, fallback = 1) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numberValue;
}

function resolveProfile({ destination, location, tourName } = {}) {
  const selector = [destination, location, tourName]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  return transportationProfiles.find((profile) => profile.matcher.test(selector)) || null;
}

export async function calculateTransportation(args = {}) {
  let participants;

  try {
    participants = toPositiveInteger(args.participants, 'participants', 1);
  } catch (error) {
    return {
      success: false,
      code: 'INVALID_TOOL_ARGUMENTS',
      message: error.message,
    };
  }

  const profile = resolveProfile(args);

  if (!profile) {
    return {
      success: false,
      code: 'TRANSPORTATION_LOCATION_REQUIRED',
      message: 'Please provide the tour location so I can estimate transportation.',
    };
  }

  const sharedTotal = profile.sharedShuttleUsd * participants;

  return {
    success: true,
    destination: profile.destination,
    origin: normalizeText(args.origin) || 'San Jose',
    estimatedTravelTime: profile.estimatedTravelTime,
    options: [
      {
        type: 'shared_shuttle',
        pricePerPerson: profile.sharedShuttleUsd,
        totalPrice: sharedTotal,
        currency: DEFAULT_CURRENCY,
      },
      {
        type: 'private_transfer',
        totalPrice: profile.privateTransferUsd,
        currency: DEFAULT_CURRENCY,
      },
    ],
    recommendedOption: participants >= 4 ? 'private_transfer' : 'shared_shuttle',
  };
}

export default calculateTransportation;
