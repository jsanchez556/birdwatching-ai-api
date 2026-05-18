import { DEFAULT_CURRENCY, TRANSPORTATION_OPTIONS } from '../../constants/business.js';
import { normalizeText } from '../../utils/normalizers.js';
import { invalidArguments, toPositiveInteger } from '../../utils/toolResponses.js';

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
    participants = toPositiveInteger(args.participants, 'participants', 1, {
      allowEmptyFallback: true,
    });
  } catch (error) {
    return invalidArguments(error);
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
        type: TRANSPORTATION_OPTIONS.SHARED_SHUTTLE,
        pricePerPerson: profile.sharedShuttleUsd,
        totalPrice: sharedTotal,
        currency: DEFAULT_CURRENCY,
      },
      {
        type: TRANSPORTATION_OPTIONS.PRIVATE_TRANSFER,
        totalPrice: profile.privateTransferUsd,
        currency: DEFAULT_CURRENCY,
      },
    ],
    recommendedOption: participants >= 4
      ? TRANSPORTATION_OPTIONS.PRIVATE_TRANSFER
      : TRANSPORTATION_OPTIONS.SHARED_SHUTTLE,
  };
}

export default calculateTransportation;
