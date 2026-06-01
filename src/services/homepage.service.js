import env from '../config/env.js';
import tourService from './tour.service.js';
import logger from '../utils/logger.js';

const PLACEHOLDER_IMAGES = {
  cloudForest: 'https://images.unsplash.com/photo-1518182170546-07661fd94144?auto=format&fit=crop&w=900&q=80',
  rainforest: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  wetlands: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80',
  toucan: 'https://images.unsplash.com/photo-1566487097168-e91a4f38bee2?auto=format&fit=crop&w=900&q=80',
};

const heroContent = {
  heroVideo: 'https://www.youtube-nocookie.com/embed/o02Dq_DaY-U?autoplay=1&mute=1&controls=0&loop=1&playlist=o02Dq_DaY-U&start=54&end=84&playsinline=1&modestbranding=1&rel=0',
};

const defaultTours = [
  {
    tourId: 1,
    name: 'Monteverde Quetzal Tour',
    location: 'Monteverde',
    pricePerPerson: 120,
    durationHours: 4,
    difficulty: 'moderate',
  },
  {
    tourId: 2,
    name: 'Sarapiqui Rainforest Tour',
    location: 'Sarapiqui',
    pricePerPerson: 95,
    durationHours: 5,
    difficulty: 'easy',
  },
  {
    tourId: 6,
    name: 'Tortuguero Canal Bird Safari',
    location: 'Tortuguero',
    pricePerPerson: 155,
    durationHours: 5,
    difficulty: 'easy',
  },
];

const tourDescriptions = {
  'Monteverde Quetzal Tour': 'A misty cloud forest walk focused on resplendent quetzals, mixed flocks, and patient scope work.',
  'Sarapiqui Rainforest Tour': 'Lowland rainforest birding with tanagers, toucans, honeycreepers, and relaxed riverside pacing.',
  'Tortuguero Canal Bird Safari': 'A quiet water-level safari for herons, kingfishers, toucans, and rainforest edge species.',
  'Carara Scarlet Macaw Walk': 'A transitional forest route for scarlet macaws, trogons, manakins, and accessible trail birding.',
  'Savegre Highland Birding Tour': 'Highland birding for quetzals, silky-flycatchers, hummingbirds, and oak forest specialties.',
  'Arenal Foothills Birding Tour': 'Foothill birding near Arenal with toucans, antbirds, tanagers, and volcano views.',
};

const birdDescriptions = {
  'Resplendent Quetzal': 'A cloud forest icon with emerald plumage and a seasonal preference for wild avocado trees.',
  'Keel-billed Toucan': 'A colorful canopy species often seen moving through fruiting trees in pairs or small groups.',
  'Scarlet Macaw': 'A brilliant Pacific-slope macaw that favors mature trees, almond groves, and open coastal forest.',
  'Snowcap': 'A tiny hummingbird prized by birders, usually found around foothill forest edges and flowering shrubs.',
  'Sunbittern': 'A streamside specialist with dramatic wing patterning, best searched for along quiet forest waterways.',
  'Three-wattled Bellbird': 'A loud seasonal migrant of highland forests, known for one of Central America’s most memorable calls.',
};

const defaultBirdNames = [
  'Resplendent Quetzal',
  'Keel-billed Toucan',
  'Scarlet Macaw',
  'Snowcap',
];

const transportation = [
  {
    id: 'shared-shuttle',
    title: 'Shared birding shuttle',
    description: 'Scheduled transfers from San Jose toward key birding regions with space for daypacks and optics.',
    coverage: 'San Jose, Monteverde, Sarapiqui',
    startingPrice: 'From $55 per person',
  },
  {
    id: 'private-transfer',
    title: 'Private lodge-to-lodge transfer',
    description: 'Door-to-door transport timed around early checkouts, guide meetups, and longer birding days.',
    coverage: 'All tour regions',
    startingPrice: 'From $180 per vehicle',
  },
  {
    id: 'canal-connection',
    title: 'Tortuguero canal connection',
    description: 'Combined road and boat logistics for Tortuguero birding itineraries and wetland departures.',
    coverage: 'San Jose to Tortuguero',
    startingPrice: 'From $85 per person',
  },
];

function getTourImage(tour) {
  const text = `${tour.name || ''} ${tour.location || ''}`.toLowerCase();

  if (text.includes('tortuguero') || text.includes('wetland')) {
    return PLACEHOLDER_IMAGES.wetlands;
  }

  if (text.includes('monteverde') || text.includes('savegre') || text.includes('cerro')) {
    return PLACEHOLDER_IMAGES.cloudForest;
  }

  return PLACEHOLDER_IMAGES.rainforest;
}

function normalizeTour(tour) {
  const title = tour.name || tour.title;
  const durationHours = tour.durationHours || tour.duration_hours;

  return {
    id: tour.tourId || tour.id,
    title,
    description: tourDescriptions[title] || 'A guided Costa Rica birdwatching experience tailored to local conditions and seasonal sightings.',
    location: tour.location,
    duration: durationHours ? `${durationHours} hours` : null,
    pricePerPerson: tour.pricePerPerson ?? tour.price ?? null,
    difficulty: tour.difficulty || null,
    imageUrl: getTourImage(tour),
  };
}

function parseConfiguredBirdNames() {
  return (env.homepageBirdHighlights || [])
    .map((name) => name.trim())
    .filter(Boolean);
}

function birdImageForName(name) {
  const normalized = name.toLowerCase();

  if (normalized.includes('toucan')) {
    return PLACEHOLDER_IMAGES.toucan;
  }

  if (normalized.includes('macaw')) {
    return PLACEHOLDER_IMAGES.rainforest;
  }

  return PLACEHOLDER_IMAGES.cloudForest;
}

class HomepageService {
  getHeroContent() {
    return heroContent;
  }

  async getFeaturedTours() {
    try {
      const result = await tourService.getAvailableTours({ participants: 1 });

      if (result.success && result.tours.length > 0) {
        return result.tours.slice(0, 6).map(normalizeTour);
      }
    } catch (error) {
      logger.warn('Falling back to static featured tours', { error: error.message });
    }

    return defaultTours.map(normalizeTour);
  }

  getBirdHighlights() {
    const configuredNames = parseConfiguredBirdNames();
    const names = configuredNames.length > 0 ? configuredNames : defaultBirdNames;

    return names.slice(0, 8).map((name) => ({
      name,
      description: birdDescriptions[name] || 'A Costa Rica birding highlight selected for visiting birdwatchers.',
      region: name.includes('Quetzal') || name.includes('Bellbird') ? 'Cloud forest' : 'Rainforest and lowlands',
      imageUrl: birdImageForName(name),
    }));
  }

  getTransportationAddOns() {
    return transportation;
  }
}

export default new HomepageService();
