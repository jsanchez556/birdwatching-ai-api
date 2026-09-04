import { DEFAULT_CURRENCY, TRANSFER_OPTIONS } from '../../constants/business.js';
import { normalizeText } from '../../utils/normalizer.utils.js';
import { invalidArguments, toPositiveInteger } from '../../utils/toolResponses.js';

const transferProfiles = [
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
  {
    matcher: /bijagua|upala|tenorio|r[ií]o celeste/i,
    destination: 'Tenorio-Bijagua and Rio Celeste',
    estimatedTravelTime: '3.5-4.5 hours from San Jose',
    sharedShuttleUsd: 75,
    privateTransferUsd: 260,
  },
];

function resolveProfile({ destination, location, tourName } = {}) {
  const selector = [destination, location, tourName]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  return transferProfiles.find((profile) => profile.matcher.test(selector)) || null;
}

export async function calculateTransfer(args = {}) {
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
      code: 'TRANSFER_LOCATION_REQUIRED',
      message: 'Please provide the tour location so I can estimate transfer options.',
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
        type: TRANSFER_OPTIONS.SHARED_SHUTTLE,
        pricePerPerson: profile.sharedShuttleUsd,
        totalPrice: sharedTotal,
        currency: DEFAULT_CURRENCY,
      },
      {
        type: TRANSFER_OPTIONS.PRIVATE_TRANSFER,
        totalPrice: profile.privateTransferUsd,
        currency: DEFAULT_CURRENCY,
      },
    ],
    recommendedOption: participants >= 4
      ? TRANSFER_OPTIONS.PRIVATE_TRANSFER
      : TRANSFER_OPTIONS.SHARED_SHUTTLE,
  };
}

export default calculateTransfer;
