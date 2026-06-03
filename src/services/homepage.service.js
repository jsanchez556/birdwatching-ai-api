import env from '../config/env.js';
import mediaAssetService from './mediaAsset.service.js';
import ragService from './rag.service.js';
import tourService from './tour.service.js';

const heroContent = {
  heroVideo: 'https://www.youtube-nocookie.com/embed/o02Dq_DaY-U?autoplay=1&mute=1&controls=0&loop=1&playlist=o02Dq_DaY-U&start=54&end=84&playsinline=1&modestbranding=1&rel=0',
};

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

function getTourPortraitUrl(tour) {
  return mediaAssetService.getFirstMediaAssetPath(
    'tours',
    tour.tourId || tour.id,
    'portraits'
  );
}

function normalizeTour(tour) {
  const title = tour.name || tour.title;
  const durationHours = tour.durationHours || tour.duration_hours;

  return {
    id: tour.tourId || tour.id,
    country: tour.country ?? null,
    zone: tour.zone ?? null,
    rank: tour.rank ?? null,
    title,
    description: tour.description ?? null,
    location: tour.location,
    node: tour.node ?? null,
    subnode: tour.subnode ?? null,
    duration: durationHours ? `${durationHours} hours` : null,
    pricePerPerson: tour.pricePerPerson ?? tour.price ?? null,
    difficulty: tour.difficulty || null,
    lon: tour.lon ?? null,
    lat: tour.lat ?? null,
    start_date: tour.start_date ?? tour.startDate ?? null,
    end_date: tour.end_date ?? tour.endDate ?? null,
    portraitUrl: getTourPortraitUrl(tour),
    birds: Array.isArray(tour.birds) ? tour.birds : [],
  };
}

function parseConfiguredHeadlineBirds() {
  return (env.headLineBirds || env.homepageBirdHighlights || [])
    .map((name) => name.trim())
    .filter(Boolean);
}

function looksLikeSpeciesCode(value) {
  return /^[a-z]{2,}\d+[a-z0-9]*$/i.test(value) && !/\s/.test(value);
}

function shuffleValues(values) {
  return values
    .map((value) => ({ value, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ value }) => value);
}

class HomepageService {
  getHeroContent() {
    return heroContent;
  }

  async getFeaturedTours() {
    const result = await tourService.getAvailableTours({ participants: 1 });

    if (!result.success || !Array.isArray(result.tours)) {
      return [];
    }

    return result.tours.map(normalizeTour);
  }

  async getBirdHighlights() {
    const birds = [];
    const seen = new Set();

    for (const candidate of shuffleValues(parseConfiguredHeadlineBirds())) {
      if (birds.length >= 5) {
        break;
      }

      const bird = await ragService.getBirdProfile(
        looksLikeSpeciesCode(candidate)
          ? { speciesCode: candidate }
          : { name: candidate }
      );
      const key = bird?.speciesCode || bird?.commonName || bird?.name;

      if (!bird || (key && seen.has(key))) {
        continue;
      }

      if (key) {
        seen.add(key);
      }

      birds.push(bird);
    }

    return birds;
  }

  async getBirdProfile({ speciesCode, name } = {}) {
    return ragService.getBirdProfile({ speciesCode, name });
  }

  getTransportationAddOns() {
    return transportation;
  }
}

export default new HomepageService();
